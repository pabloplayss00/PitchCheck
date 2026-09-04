(function () {
  "use strict";

  var D = window.FORMCHECK_DATA;
  var RAW_LEAGUES = D.RAW_LEAGUES, EURO_STRENGTH = D.EURO_STRENGTH, CUPS = D.CUPS, MATCHES = D.MATCHES;

  var HOME_ADV = 1.12, AWAY_ADV = 0.94;
  var GOAL_LINES = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
  var CARD_LINES = [2.5, 3.5, 4.5, 5.5];
  var CORNER_LINES = [8.5, 9.5, 10.5, 11.5];
  var HANDICAP_LINES = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];
  var PROMOTED_DEFAULT = { attack: 0.84, defence: 1.18 };
  var TABS = [
    { id:"result", label:"Match Result" },
    { id:"goals", label:"Goals" },
    { id:"scorelines", label:"Scorelines" },
    { id:"handicap", label:"Handicap" },
    { id:"cardscorners", label:"Cards & Corners" },
    { id:"players", label:"By Role" }
  ];
  var REFEREES = [
    { id:"lenient", name:"Lenient referee", mult:0.82, hint:"Lets the game flow, cards sparingly" },
    { id:"average", name:"Average referee", mult:1.00, hint:"League-average card rate" },
    { id:"strict", name:"Strict referee", mult:1.30, hint:"Quick to reach for cards" }
  ];

  // ---------- Build rated team pools ----------
  function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }

  function buildLeague(key, raw){
    var played = raw.teams.filter(function(t){ return t[3]!=null; });
    var sumGF=0, sumGA=0, sumP=0;
    played.forEach(function(t){ sumGF+=t[1]; sumGA+=t[2]; sumP+=t[3]; });
    var avgGF = sumGF/sumP, avgGA = sumGA/sumP;
    var teams = raw.teams.map(function(t, idx){
      var name=t[0], gf=t[1], ga=t[2], pld=t[3];
      var attack, defence, promoted;
      if(pld!=null){
        attack = (gf/pld)/avgGF;
        defence = (ga/pld)/avgGA;
        promoted = false;
      } else {
        attack = PROMOTED_DEFAULT.attack;
        defence = PROMOTED_DEFAULT.defence;
        promoted = true;
      }
      var cardsAvg = clamp(1.9 + 0.6*(defence-1) - 0.15*(attack-1), 1.4, 3.3);
      var cornersAvg = clamp(4.8 + 1.3*(attack-1), 3.0, 7.2);
      return { name:name, league:key, leagueName:raw.short, attack:attack, defence:defence,
        cardsAvg:cardsAvg, cornersAvg:cornersAvg, promoted:promoted, pos: promoted?999:idx };
    });
    return { name: raw.name, short: raw.short, country: raw.country, teams: teams, avgGoals: (avgGF+avgGA)/2 };
  }

  var LEAGUES = {};
  Object.keys(RAW_LEAGUES).forEach(function(k){ LEAGUES[k] = buildLeague(k, RAW_LEAGUES[k]); });

  var EURO_AVG_GOALS = (function(){
    var keys = Object.keys(LEAGUES);
    var sum = keys.reduce(function(a,k){ return a+LEAGUES[k].avgGoals; }, 0);
    return sum/keys.length;
  })();

  function teamByName(leagueKey, name){
    return LEAGUES[leagueKey].teams.filter(function(t){ return t.name===name; })[0];
  }
  function topN(leagueKey, n, skip){
    return LEAGUES[leagueKey].teams.filter(function(t){ return !t.promoted; }).slice(skip, skip+n);
  }
  var UCL_TEAMS = [].concat.apply([], Object.keys(LEAGUES).map(function(k){ return topN(k,4,0); }));
  var UEL_TEAMS = [].concat.apply([], Object.keys(LEAGUES).map(function(k){ return topN(k,2,4); }));

  var COMPETITIONS = [
    { id:"epl", type:"league", label:"Premier League" },
    { id:"laliga", type:"league", label:"La Liga" },
    { id:"seriea", type:"league", label:"Serie A" },
    { id:"bundesliga", type:"league", label:"Bundesliga" },
    { id:"ligue1", type:"league", label:"Ligue 1" },
    { id:"ucl", type:"euro", label:"Champions League" },
    { id:"uel", type:"euro", label:"Europa League" },
    { id:"facup", type:"cup", label:"FA Cup" },
    { id:"copadelrey", type:"cup", label:"Copa del Rey" },
    { id:"coppaitalia", type:"cup", label:"Coppa Italia" },
    { id:"dfbpokal", type:"cup", label:"DFB-Pokal" },
    { id:"coupedefrance", type:"cup", label:"Coupe de France" }
  ];
  var RIVALRIES = {
    ucl: [], uel: [],
    facup: [["Arsenal","Tottenham Hotspur"]], copadelrey: [["Barcelona","Real Madrid"]],
    coppaitalia: [["Inter Milan","AC Milan"]], dfbpokal: [["Bayern Munich","Borussia Dortmund"]],
    coupedefrance: [["Paris Saint-Germain","Olympique de Marseille"]]
  };

  function compOf(id){ return COMPETITIONS.filter(function(c){ return c.id===id; })[0]; }

  function poolFor(compId){
    var comp = compOf(compId);
    if(comp.type==="league") return LEAGUES[compId].teams;
    if(compId==="ucl") return UCL_TEAMS;
    if(compId==="uel") return UEL_TEAMS;
    if(comp.type==="cup"){
      var cup = CUPS.filter(function(c){ return c.id===compId; })[0];
      return LEAGUES[cup.leagueRef].teams.filter(function(t){ return !t.promoted; });
    }
    return [];
  }

  var state = { compId:"epl", matchIdx:0, homeIdx:0, awayIdx:1, refId:"average", tier:"free", activeTab:"result", accaLegs:[] };

  // ---------- Math ----------
  function fact(k){ var f=1; for(var i=2;i<=k;i++) f*=i; return f; }
  function poissonPMF(k,lambda){ return Math.exp(-lambda)*Math.pow(lambda,k)/fact(k); }
  function poissonCDF(k,lambda){ var s=0; for(var i=0;i<=k;i++) s+=poissonPMF(i,lambda); return s; }
  function pct(x){ return Math.round(x*100)+"%"; }
  function poissonArr(lambda, n){
    var arr=[], sum=0, k;
    for(k=0;k<n;k++){ arr.push(poissonPMF(k,lambda)); sum+=arr[k]; }
    arr[n-1]+=Math.max(0,1-sum);
    return arr;
  }

  function buildModel(homeTeam, awayTeam, refMult, avgGoals, isEuro){
    var euroH = isEuro ? (EURO_STRENGTH[homeTeam.league]||1) : 1;
    var euroA = isEuro ? (EURO_STRENGTH[awayTeam.league]||1) : 1;
    var homeAttack = homeTeam.attack*euroH, homeDefence = homeTeam.defence/euroH;
    var awayAttack = awayTeam.attack*euroA, awayDefence = awayTeam.defence/euroA;

    var hLambda = avgGoals*homeAttack*awayDefence*HOME_ADV;
    var aLambda = avgGoals*awayAttack*homeDefence*AWAY_ADV;
    var N = 7, i, j, k;
    var hp=[], ap=[], hSum=0, aSum=0;
    for(k=0;k<N;k++){ hp.push(poissonPMF(k,hLambda)); ap.push(poissonPMF(k,aLambda)); hSum+=hp[k]; aSum+=ap[k]; }
    hp[N-1]+=Math.max(0,1-hSum); ap[N-1]+=Math.max(0,1-aSum);

    var homeWin=0, draw=0, awayWin=0, btts=0, winNilHome=0, winNilAway=0;
    var goalOver={}; GOAL_LINES.forEach(function(L){ goalOver[L]=0; });
    var marginDist={};

    for(i=0;i<N;i++){
      for(j=0;j<N;j++){
        var p = hp[i]*ap[j];
        var margin = i-j, total = i+j;
        if(margin>0) homeWin+=p; else if(margin===0) draw+=p; else awayWin+=p;
        if(i>0 && j>0) btts+=p;
        if(margin>0 && j===0) winNilHome+=p;
        if(margin<0 && i===0) winNilAway+=p;
        GOAL_LINES.forEach(function(L){ if(total>L) goalOver[L]+=p; });
        marginDist[margin] = (marginDist[margin]||0) + p;
      }
    }

    var grid=[];
    for(i=0;i<5;i++){ var row=[]; for(j=0;j<5;j++){ row.push(hp[i]*ap[j]); } grid.push(row); }
    var scoreEntries=[];
    for(i=0;i<5;i++){ for(j=0;j<5;j++){ scoreEntries.push({h:i,a:j,p:grid[i][j]}); } }
    scoreEntries.sort(function(a,b){ return b.p-a.p; });
    var topScores = scoreEntries.slice(0,6);
    var topSum = topScores.reduce(function(acc,s){ return acc+s.p; },0);
    var anyOther = Math.max(0, 1-topSum);

    var hcap = HANDICAP_LINES.map(function(L){
      var threshold = -L;
      var win=0, push=0;
      Object.keys(marginDist).forEach(function(mKey){
        var m = Number(mKey);
        if(m>threshold) win += marginDist[m];
        else if(Number.isInteger(threshold) && m===threshold) push += marginDist[m];
      });
      return { line:L, win:win, push:push };
    });

    var h1p = poissonArr(hLambda*0.45, 5), h2p = poissonArr(hLambda*0.55, 5);
    var a1p = poissonArr(aLambda*0.45, 5), a2p = poissonArr(aLambda*0.55, 5);
    var htft = { HH:0,HD:0,HA:0, DH:0,DD:0,DA:0, AH:0,AD:0,AA:0 };
    for(var h1=0; h1<5; h1++){
      for(var a1=0; a1<5; a1++){
        var htR = h1>a1 ? "H" : (h1===a1 ? "D" : "A");
        for(var h2=0; h2<5; h2++){
          for(var a2=0; a2<5; a2++){
            var pp = h1p[h1]*a1p[a1]*h2p[h2]*a2p[a2];
            var ftH=h1+h2, ftA=a1+a2;
            var ftR = ftH>ftA ? "H" : (ftH===ftA ? "D" : "A");
            htft[htR+ftR] += pp;
          }
        }
      }
    }

    var cardsLambda = (homeTeam.cardsAvg+awayTeam.cardsAvg)*refMult;
    var cardLines = CARD_LINES.map(function(L){ return { line:L, over: 1-poissonCDF(Math.floor(L), cardsLambda) }; });

    var cornersLambda = homeTeam.cornersAvg+awayTeam.cornersAvg;
    var cornerLines = CORNER_LINES.map(function(L){ return { line:L, over: 1-poissonCDF(Math.floor(L), cornersLambda) }; });

    var best = topScores[0];

    return {
      home:homeTeam, away:awayTeam, hLambda:hLambda, aLambda:aLambda, hp:hp, ap:ap,
      homeWin:homeWin, draw:draw, awayWin:awayWin,
      dcHD: homeWin+draw, dcAD: awayWin+draw, dcHA: homeWin+awayWin,
      dnbHome: homeWin/(homeWin+awayWin), dnbAway: awayWin/(homeWin+awayWin),
      btts:btts, bttsNo: 1-btts,
      winNilHome:winNilHome, winNilAway:winNilAway,
      cleanSheetHome: ap[0], cleanSheetAway: hp[0],
      goalOver:goalOver,
      teamOverHome: 1-hp[0]-hp[1], teamOverAway: 1-ap[0]-ap[1],
      grid:grid, topScores:topScores, anyOther:anyOther, bestScore: best.h+"-"+best.a,
      hcap:hcap, htft:htft,
      cardsLambda:cardsLambda, cardLines:cardLines,
      cornersLambda:cornersLambda, cornerLines:cornerLines
    };
  }

  function el(tag, attrs, html){
    var e = document.createElement(tag);
    for(var k in attrs){ e.setAttribute(k, attrs[k]); }
    if(html!=null) e.innerHTML = html;
    return e;
  }

  function hexToRgb(hex){
    hex = hex.replace('#','');
    return [parseInt(hex.substring(0,2),16), parseInt(hex.substring(2,4),16), parseInt(hex.substring(4,6),16)];
  }
  function lerp(a,b,t){ return a+(b-a)*t; }
  function heatColor(t, lo, hi){
    var c1=hexToRgb(lo), c2=hexToRgb(hi);
    var r=Math.round(lerp(c1[0],c2[0],t)), g=Math.round(lerp(c1[1],c2[1],t)), b=Math.round(lerp(c1[2],c2[2],t));
    var lum = (0.299*r+0.587*g+0.114*b)/255;
    return { bg:"rgb("+r+","+g+","+b+")", text: lum>0.55 ? "#17211B" : "#F3F1E6" };
  }

  function miniRow(label, value, sub){
    var li = el("li", {});
    li.innerHTML = '<span>'+label+(sub?'<span class="sub">'+sub+'</span>':'')+'</span><span class="v mono">'+value+'</span>';
    return li;
  }

  function fmtDate(dateStr){
    var d = new Date(dateStr+"T12:00:00");
    return d.toLocaleDateString(undefined, { weekday:"long", day:"numeric", month:"long" });
  }
  function fmtDateShort(dateStr){
    var d = new Date(dateStr+"T12:00:00");
    return d.toLocaleDateString(undefined, { weekday:"short", day:"numeric", month:"short" });
  }

  // ---------- Picker rendering ----------
  function renderCompSelect(){
    var sel = document.getElementById("compSelect");
    if(sel.options.length===0){
      var groups = { league:"Leagues (real fixtures)", euro:"European competitions", cup:"Domestic cups" };
      var lastGroup = null, optgroup = null;
      COMPETITIONS.forEach(function(c){
        if(c.type!==lastGroup){
          optgroup = el("optgroup", {label: groups[c.type]});
          sel.appendChild(optgroup);
          lastGroup = c.type;
        }
        optgroup.appendChild(el("option", {value:c.id}, c.label));
      });
      sel.addEventListener("change", function(){
        state.compId = sel.value;
        state.matchIdx = 0;
        var pool = poolFor(state.compId);
        state.homeIdx = 0; state.awayIdx = Math.min(1, pool.length-1);
        renderAll();
      });
    }
    sel.value = state.compId;

    var comp = compOf(state.compId);
    var noteEl = document.getElementById("compNote");
    if(comp.type==="cup"){
      var cup = CUPS.filter(function(c){ return c.id===state.compId; })[0];
      noteEl.textContent = cup.note;
      noteEl.classList.add("show");
    } else if(comp.type==="euro"){
      noteEl.textContent = "Field limited to clubs from the five leagues modelled above (top 4 per league for the Champions League, next 2 for the Europa League), with a cross-league strength adjustment — not the real draw.";
      noteEl.classList.add("show");
    } else {
      noteEl.textContent = "Real 2026-27 results and fixtures as of " + fmtDate(D.SNAPSHOT_DATE) + ".";
      noteEl.classList.add("show");
    }

    document.getElementById("matchListWrap").style.display = comp.type==="league" ? "" : "none";
    document.getElementById("teamPickWrap").style.display = comp.type==="league" ? "none" : "";
  }

  function currentLeagueMatches(){
    return (MATCHES[state.compId] || []).map(function(m, idx){
      return { idx:idx, date:m[0], home:m[1], away:m[2], hg:m[3], ag:m[4], kickoff:m[5]||null, played: m[3]!=null };
    });
  }

  function renderMatchList(){
    var wrap = document.getElementById("matchList");
    wrap.innerHTML = "";
    var matches = currentLeagueMatches();
    if(state.matchIdx>=matches.length) state.matchIdx = 0;
    var firstUpcoming = matches.findIndex(function(m){ return !m.played; });
    var lastDate = null;
    matches.forEach(function(m, i){
      if(m.date!==lastDate){
        wrap.appendChild(el("div", {"class":"match-date-head"}, fmtDate(m.date)));
        lastDate = m.date;
      }
      if(i===firstUpcoming && firstUpcoming>0){
        wrap.appendChild(el("div", {"class":"today-divider"}, "Upcoming"));
      }
      var row = el("button", {"class":"match-row"+(i===state.matchIdx?" active":""), "type":"button", "data-idx":i});
      var scoreHtml = m.played
        ? '<span class="match-score">'+m.hg+' – '+m.ag+'</span>'
        : '<span class="match-kickoff">'+(m.kickoff||"")+'</span>';
      row.innerHTML =
        '<span class="match-team home">'+m.home+'</span>' +
        scoreHtml +
        '<span class="match-team away">'+m.away+'</span>' +
        (m.played ? '<span class="ft-pill">FT</span>' : '');
      row.addEventListener("click", function(){ state.matchIdx = i; renderAll(); });
      wrap.appendChild(row);
    });
  }

  function renderTeamSelects(){
    var pool = poolFor(state.compId);
    var homeSel = document.getElementById("homeSelect");
    var awaySel = document.getElementById("awaySelect");
    [homeSel, awaySel].forEach(function(sel){
      sel.innerHTML = "";
      pool.forEach(function(t, idx){
        var label = t.name + (t.leagueName && (state.compId==="ucl"||state.compId==="uel") ? " ("+t.leagueName+")" : "");
        sel.appendChild(el("option", {value:idx}, label));
      });
    });
    if(state.homeIdx>=pool.length) state.homeIdx=0;
    if(state.awayIdx>=pool.length) state.awayIdx=Math.min(1,pool.length-1);
    if(state.awayIdx===state.homeIdx) state.awayIdx = (state.homeIdx+1) % pool.length;
    homeSel.value = state.homeIdx;
    awaySel.value = state.awayIdx;

    homeSel.onchange = function(){ state.homeIdx = Number(homeSel.value); if(state.awayIdx===state.homeIdx){ state.awayIdx=(state.homeIdx+1)%pool.length; } renderAll(); };
    awaySel.onchange = function(){ state.awayIdx = Number(awaySel.value); if(state.awayIdx===state.homeIdx){ state.homeIdx=(state.awayIdx+1)%pool.length; } renderAll(); };

    document.getElementById("swapBtn").onclick = function(){
      var t = state.homeIdx; state.homeIdx = state.awayIdx; state.awayIdx = t; renderAll();
    };

    var row = document.getElementById("rivalryRow");
    row.innerHTML = "";
    var pairs = RIVALRIES[state.compId] || [];
    if(pairs.length){
      row.appendChild(el("span", {"class":"r-label"}, "Example matchups"));
      pairs.forEach(function(pair){
        var hIdx = pool.findIndex(function(t){ return t.name===pair[0]; });
        var aIdx = pool.findIndex(function(t){ return t.name===pair[1]; });
        if(hIdx<0||aIdx<0) return;
        var chip = el("button", {"class":"rivalry-chip", type:"button"}, pair[0]+" v "+pair[1]);
        chip.addEventListener("click", function(){ state.homeIdx=hIdx; state.awayIdx=aIdx; renderAll(); });
        row.appendChild(chip);
      });
    }
  }

  function renderRefSelect(){
    var sel = document.getElementById("refSelect");
    if(sel.options.length===0){
      REFEREES.forEach(function(r){ sel.appendChild(el("option", {value:r.id}, r.name)); });
      sel.value = state.refId;
      sel.addEventListener("change", function(){ state.refId = sel.value; renderAll(); });
    } else {
      sel.value = state.refId;
    }
    var ref = REFEREES.filter(function(r){ return r.id===state.refId; })[0];
    document.getElementById("refHint").textContent = ref.hint;
  }

  function statTile(label, value, ratio, premium){
    var tile = el("div", {"class":"stat-tile"+(premium?" premium-hue":"")});
    tile.innerHTML =
      '<div class="label">'+label+'</div>' +
      '<div class="value mono">'+value+'</div>' +
      '<div class="meter"><i style="width:'+Math.round(ratio*100)+'%"></i></div>';
    return tile;
  }

  function renderResultBanner(matchInfo){
    var el2 = document.getElementById("resultBanner");
    if(matchInfo && matchInfo.played){
      el2.innerHTML = '<span class="ft-pill big">Full time</span> ' +
        '<span class="rb-score mono">'+matchInfo.home+' '+matchInfo.hg+' – '+matchInfo.ag+' '+matchInfo.away+'</span>' +
        '<span class="rb-note">Odds below are the current model read on this matchup, not a recorded pre-match line.</span>';
      el2.classList.add("show");
    } else {
      el2.classList.remove("show");
      el2.innerHTML = "";
    }
  }

  function renderFree(model, comp, matchInfo){
    var subText = comp.label + (matchInfo ? " · " + (matchInfo.played ? fmtDateShort(matchInfo.date) : fmtDateShort(matchInfo.date) + (matchInfo.kickoff ? ", " + matchInfo.kickoff : "")) : "");
    document.getElementById("freeSub").textContent = subText;
    renderResultBanner(matchInfo);

    var bar = document.getElementById("wdlBar");
    bar.innerHTML =
      '<div class="wdl-seg home" style="width:'+(model.homeWin*100)+'%"></div>' +
      '<div class="wdl-seg draw" style="width:'+(model.draw*100)+'%"></div>' +
      '<div class="wdl-seg away" style="width:'+(model.awayWin*100)+'%"></div>';

    var legend = document.getElementById("wdlLegend");
    legend.innerHTML =
      '<li><span class="swatch home"></span>'+model.home.name+' win<span class="pct mono">'+pct(model.homeWin)+'</span></li>' +
      '<li><span class="swatch draw"></span>Draw<span class="pct mono">'+pct(model.draw)+'</span></li>' +
      '<li><span class="swatch away"></span>'+model.away.name+' win<span class="pct mono">'+pct(model.awayWin)+'</span></li>';

    var tiles = document.getElementById("goalsTiles");
    tiles.innerHTML = "";
    tiles.appendChild(statTile("Over 1.5 goals", pct(model.goalOver[1.5]), model.goalOver[1.5]));
    tiles.appendChild(statTile("Over 2.5 goals", pct(model.goalOver[2.5]), model.goalOver[2.5]));
    tiles.appendChild(statTile("Over 3.5 goals", pct(model.goalOver[3.5]), model.goalOver[3.5]));
    tiles.appendChild(statTile("Both teams to score", pct(model.btts), model.btts));

    document.getElementById("likelyScore").textContent = model.home.name+" "+model.bestScore.replace("-", " – ")+" "+model.away.name;
  }

  function renderResultTab(model){
    var r = document.getElementById("mrResult"); r.innerHTML = "";
    r.appendChild(miniRow(model.home.name+" win", pct(model.homeWin)));
    r.appendChild(miniRow("Draw", pct(model.draw)));
    r.appendChild(miniRow(model.away.name+" win", pct(model.awayWin)));

    var d = document.getElementById("mrDouble"); d.innerHTML = "";
    d.appendChild(miniRow(model.home.name+" or Draw", pct(model.dcHD), "Double chance 1X"));
    d.appendChild(miniRow(model.away.name+" or Draw", pct(model.dcAD), "Double chance X2"));
    d.appendChild(miniRow(model.home.name+" or "+model.away.name, pct(model.dcHA), "Double chance 12"));
    d.appendChild(miniRow("Draw no bet — "+model.home.name, pct(model.dnbHome)));
    d.appendChild(miniRow("Draw no bet — "+model.away.name, pct(model.dnbAway)));
  }

  function renderGoalsTab(model){
    var g = document.getElementById("mrGoals"); g.innerHTML = "";
    GOAL_LINES.forEach(function(L){
      g.appendChild(miniRow("Over "+L+" goals", pct(model.goalOver[L])));
    });

    var b = document.getElementById("mrBtts"); b.innerHTML = "";
    b.appendChild(miniRow("Yes", pct(model.btts)));
    b.appendChild(miniRow("No", pct(model.bttsNo)));

    var t = document.getElementById("mrTeamGoals"); t.innerHTML = "";
    t.appendChild(miniRow(model.home.name+" over 1.5 goals", pct(model.teamOverHome)));
    t.appendChild(miniRow(model.away.name+" over 1.5 goals", pct(model.teamOverAway)));
    t.appendChild(miniRow(model.home.name+" clean sheet", pct(model.cleanSheetHome)));
    t.appendChild(miniRow(model.away.name+" clean sheet", pct(model.cleanSheetAway)));
    t.appendChild(miniRow(model.home.name+" to win to nil", pct(model.winNilHome)));
    t.appendChild(miniRow(model.away.name+" to win to nil", pct(model.winNilAway)));
  }

  function renderScorelinesTab(model){
    var list = document.getElementById("scoreList");
    list.innerHTML = "";
    var maxP = model.topScores[0].p;
    model.topScores.forEach(function(s, idx){
      var li = el("li", {});
      li.innerHTML =
        '<span class="rank mono">'+(idx+1)+'</span>' +
        '<span class="sc">'+s.h+'–'+s.a+'</span>' +
        '<span class="bar"><i style="width:'+Math.round((s.p/maxP)*100)+'%"></i></span>' +
        '<span class="p">'+pct(s.p)+'</span>';
      list.appendChild(li);
    });
    var otherLi = el("li", {});
    otherLi.innerHTML = '<span class="rank"></span><span class="sc" style="width:auto;">Any other</span><span class="bar"></span><span class="p">'+pct(model.anyOther)+'</span>';
    list.appendChild(otherLi);

    var table = document.getElementById("htftTable");
    var rows = ["H","D","A"];
    var labels = { H:model.home.name, D:"Draw", A:model.away.name };
    var html = '<thead><tr><th>HT \\ FT</th><th class="center">'+labels.H+'</th><th class="center">'+labels.D+'</th><th class="center">'+labels.A+'</th></tr></thead><tbody>';
    rows.forEach(function(ht){
      html += '<tr><td>'+labels[ht]+'</td>';
      rows.forEach(function(ft){
        var v = model.htft[ht+ft];
        var hi = ht===ft ? ' hi' : '';
        html += '<td class="center'+hi+'">'+pct(v)+'</td>';
      });
      html += '</tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;

    var styles = getComputedStyle(document.documentElement);
    var lo = styles.getPropertyValue("--heat-lo").trim() || "#EEF6EE";
    var hi = styles.getPropertyValue("--heat-hi").trim() || "#1F6B44";
    var maxGrid = 0;
    model.grid.forEach(function(row){ row.forEach(function(p){ if(p>maxGrid) maxGrid=p; }); });

    var hm = document.getElementById("heatmap");
    hm.innerHTML = "";
    hm.appendChild(el("div", {"class":"hm-corner"}));
    for(var j=0;j<5;j++){ hm.appendChild(el("div", {"class":"hm-axis"}, String(j))); }
    for(var i=0;i<5;i++){
      hm.appendChild(el("div", {"class":"hm-axis"}, String(i)));
      for(j=0;j<5;j++){
        var t = maxGrid>0 ? model.grid[i][j]/maxGrid : 0;
        var c = heatColor(t, lo, hi);
        var cell = el("div", {"class":"hm-cell", "title": i+"-"+j+": "+pct(model.grid[i][j]) });
        cell.style.background = c.bg;
        cell.style.color = c.text;
        cell.textContent = Math.round(model.grid[i][j]*100);
        hm.appendChild(cell);
      }
    }
  }

  function renderHandicapTab(model){
    var table = document.getElementById("hcapTable");
    var html = '<thead><tr><th>Line</th><th class="pct">Win</th><th class="pct">Push</th></tr></thead><tbody>';
    model.hcap.forEach(function(h){
      var label = "Home "+(h.line>0?"+":"")+h.line;
      html += '<tr><td>'+label+'</td><td class="pct">'+pct(h.win)+'</td><td class="pct">'+(h.push>0?pct(h.push):'—')+'</td></tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
  }

  function renderCardsCornersTab(model){
    var c = document.getElementById("cardsTiles"); c.innerHTML = "";
    model.cardLines.forEach(function(cl){
      c.appendChild(statTile("Cards O"+cl.line, pct(cl.over), cl.over, true));
    });
    var co = document.getElementById("cornersTiles"); co.innerHTML = "";
    model.cornerLines.forEach(function(cl){
      co.appendChild(statTile("Corners O"+cl.line, pct(cl.over), cl.over, true));
    });
  }

  function renderPlayersTab(model){
    var body = document.getElementById("playersBody");
    body.innerHTML = "";
    var roles = [["FW","Lead forward"],["MF","Attacking midfielder"],["DF","Regular defender"]];
    var goalShares = { FW:0.30, MF:0.17, DF:0.06 };
    [ [model.home, model.hLambda], [model.away, model.aLambda] ].forEach(function(pair){
      var team = pair[0], teamGoals = pair[1];
      roles.forEach(function(role){
        var pos = role[0], label = role[1];
        var goalLambda = goalShares[pos]*teamGoals;
        var toScoreP = 1-Math.exp(-goalLambda);
        var cardShare = pos==="DF" ? 0.30 : (pos==="MF" ? 0.24 : 0.14);
        var cardLambda = cardShare*team.cardsAvg;
        var bookedP = 1-Math.exp(-cardLambda);
        var tr = el("tr", {});
        tr.innerHTML =
          '<td>'+label+' <span class="pos-tag">'+pos+'</span></td><td>'+team.name+'</td>' +
          '<td class="pct">'+pct(toScoreP)+'</td><td class="pct">'+pct(bookedP)+'</td>';
        body.appendChild(tr);
      });
    });
  }

  function renderMarketTabs(){
    var wrap = document.getElementById("marketTabs");
    if(wrap.children.length===0){
      TABS.forEach(function(t){
        var btn = el("button", { "class":"market-tab", role:"tab", "aria-selected": String(t.id===state.activeTab), "data-tab":t.id }, t.label);
        btn.addEventListener("click", function(){ state.activeTab = this.getAttribute("data-tab"); applyActiveTab(); }.bind(btn));
        wrap.appendChild(btn);
      });
    }
    applyActiveTab();
  }
  function applyActiveTab(){
    document.querySelectorAll(".market-tab").forEach(function(b){ b.setAttribute("aria-selected", String(b.getAttribute("data-tab")===state.activeTab)); });
    document.querySelectorAll(".market-panel").forEach(function(p){ p.classList.toggle("active", p.getAttribute("data-panel")===state.activeTab); });
  }

  function renderPremium(model){
    renderMarketTabs();
    renderResultTab(model);
    renderGoalsTab(model);
    renderScorelinesTab(model);
    renderHandicapTab(model);
    renderCardsCornersTab(model);
    renderPlayersTab(model);
  }

  function renderAcca(model, comp, matchInfo){
    var addRow = document.getElementById("accaMarkets");
    var label = document.getElementById("accaCurrentLabel");
    var playedNotice = document.getElementById("accaPlayedNotice");

    if(matchInfo && matchInfo.played){
      addRow.innerHTML = "";
      label.textContent = "This match has been played";
      playedNotice.textContent = "Pick an upcoming fixture from the list above to add legs to your accumulator.";
      playedNotice.classList.add("show");
      return;
    }
    playedNotice.classList.remove("show");

    label.textContent = "Add from " + model.home.name + " v " + model.away.name + " (" + comp.label + ")";
    addRow.innerHTML = "";
    var c45 = model.cardLines.filter(function(c){ return c.line===4.5; })[0];
    var matchKey = comp.id+"|"+(matchInfo?matchInfo.date:"free")+"|"+model.home.name+"|"+model.away.name;
    var markets = [
      { key:"home", prob:model.homeWin, label:model.home.name+" win" },
      { key:"away", prob:model.awayWin, label:model.away.name+" win" },
      { key:"dc1x", prob:model.dcHD, label:model.home.name+" or draw" },
      { key:"over25", prob:model.goalOver[2.5], label:"Over 2.5 goals" },
      { key:"btts", prob:model.btts, label:"BTTS yes" },
      { key:"cardsU45", prob:1-c45.over, label:"Under 4.5 cards" }
    ];
    markets.forEach(function(m){
      var legKey = matchKey+"|"+m.key;
      var added = state.accaLegs.some(function(l){ return l.key===legKey; });
      var btn = el("button", {"class":"market-btn", "aria-pressed": String(added), "data-leg": legKey});
      btn.innerHTML = m.label+' <span class="p mono">'+pct(m.prob)+'</span>';
      btn.addEventListener("click", function(){ toggleLeg(legKey, model.home.name+" v "+model.away.name+" — "+m.label, m.prob, matchKey); });
      addRow.appendChild(btn);
    });
  }

  function toggleLeg(key, label, prob, matchKey){
    var idx = state.accaLegs.findIndex(function(l){ return l.key===key; });
    if(idx>=0){ state.accaLegs.splice(idx,1); }
    else { state.accaLegs.push({key:key, label:label, prob:prob, matchKey:matchKey}); }
    renderAll();
  }

  function renderSlip(){
    var list = document.getElementById("slipLegs");
    list.innerHTML = "";
    if(state.accaLegs.length===0){
      list.appendChild(el("li", {"class":"empty"}, "No legs added yet — pick markets above."));
    } else {
      state.accaLegs.forEach(function(l){
        var li = el("li", {"class":"slip-leg"});
        li.innerHTML = '<span class="txt">'+l.label+'</span><span class="p mono">'+pct(l.prob)+'</span>';
        var rm = el("button", {"aria-label":"Remove leg", type:"button"}, "&times;");
        rm.addEventListener("click", function(){ toggleLeg(l.key, l.label, l.prob, l.matchKey); });
        li.appendChild(rm);
        list.appendChild(li);
      });
    }
    var combined = state.accaLegs.reduce(function(acc,l){ return acc*l.prob; }, 1);
    document.getElementById("slipCount").textContent = String(state.accaLegs.length);
    document.getElementById("slipCombined").textContent = state.accaLegs.length ? pct(combined) : "—";
    document.getElementById("slipOdds").textContent = state.accaLegs.length && combined>0 ? (1/combined).toFixed(2) : "—";

    var matchKeys = state.accaLegs.map(function(l){ return l.matchKey; });
    var hasDup = matchKeys.some(function(id,i){ return matchKeys.indexOf(id)!==i; });
    document.getElementById("slipNote").classList.toggle("show", hasDup);
  }

  function renderTierUI(){
    document.querySelector(".page").setAttribute("data-tier", state.tier);
    document.querySelectorAll("[data-set-tier]").forEach(function(btn){
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-set-tier")===state.tier));
    });
  }

  function renderAll(){
    renderCompSelect();

    var comp = compOf(state.compId);
    var homeTeam, awayTeam, matchInfo = null, avgGoals, isEuro = comp.type==="euro";

    if(comp.type==="league"){
      renderMatchList();
      var matches = currentLeagueMatches();
      var m = matches[state.matchIdx] || matches[0];
      matchInfo = m;
      homeTeam = teamByName(state.compId, m.home);
      awayTeam = teamByName(state.compId, m.away);
      avgGoals = LEAGUES[state.compId].avgGoals;
    } else {
      renderTeamSelects();
      var pool = poolFor(state.compId);
      homeTeam = pool[state.homeIdx]; awayTeam = pool[state.awayIdx];
      avgGoals = isEuro ? EURO_AVG_GOALS : LEAGUES[CUPS.filter(function(c){return c.id===comp.id;})[0].leagueRef].avgGoals;
    }

    renderRefSelect();
    var ref = REFEREES.filter(function(r){ return r.id===state.refId; })[0];
    var model = buildModel(homeTeam, awayTeam, ref.mult, avgGoals, isEuro);

    renderFree(model, comp, matchInfo);
    renderPremium(model);
    renderAcca(model, comp, matchInfo);
    renderSlip();
    renderTierUI();
  }

  document.querySelectorAll("[data-set-tier]").forEach(function(btn){
    btn.addEventListener("click", function(){ state.tier = btn.getAttribute("data-set-tier"); renderAll(); });
  });

  if(window.matchMedia){
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);
  }

  renderAll();
})();
