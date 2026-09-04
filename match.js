/* PitchCheck — single match page (match.html). Reads which fixture to show
 * from the URL (?comp=...&idx=... for a league fixture, or
 * ?comp=...&home=...&away=... for a free-pick competition), builds the
 * model via engine.js, and renders the full market breakdown. The mini
 * competition/match switcher at the top navigates to a new URL rather than
 * mutating in-page state, so every view is a real, linkable page — but the
 * acca slip (acca.js) is shared storage, so legs survive the navigation.
 */
(function () {
  "use strict";
  var E = window.PC_ENGINE, ACCA = window.PC_ACCA;

  function qs(){
    var p = new URLSearchParams(window.location.search);
    return { comp: p.get("comp")||"epl", idx: p.get("idx"), home: p.get("home"), away: p.get("away") };
  }
  function matchUrl(compId, params){
    var q = ["comp="+encodeURIComponent(compId)];
    Object.keys(params).forEach(function(k){ q.push(k+"="+encodeURIComponent(params[k])); });
    return "match.html?"+q.join("&");
  }

  var params = qs();
  var comp = E.compOf(params.comp) || E.compOf("epl");
  var state = { activeTab:"result", refPoolKey:null, refIdx:0 };

  function el(tag, attrs, html){
    var e = document.createElement(tag);
    for(var k in attrs){ e.setAttribute(k, attrs[k]); }
    if(html!=null) e.innerHTML = html;
    return e;
  }
  function fmtDate(dateStr){
    var d = new Date(dateStr+"T12:00:00");
    return d.toLocaleDateString(undefined, { weekday:"long", day:"numeric", month:"long" });
  }
  function fmtDateShort(dateStr){
    var d = new Date(dateStr+"T12:00:00");
    return d.toLocaleDateString(undefined, { weekday:"short", day:"numeric", month:"short" });
  }
  function pct(x){ return E.pct(x); }
  function miniRow(label, value, sub){
    var li = el("li", {});
    li.innerHTML = '<span>'+label+(sub?'<span class="sub">'+sub+'</span>':'')+'</span><span class="v mono">'+value+'</span>';
    return li;
  }
  function statTile(label, value, ratio, premium){
    var tile = el("div", {"class":"stat-tile"+(premium?" premium-hue":"")});
    tile.innerHTML =
      '<div class="label">'+label+'</div>' +
      '<div class="value mono">'+value+'</div>' +
      '<div class="meter"><i style="width:'+Math.round(ratio*100)+'%"></i></div>';
    return tile;
  }
  function tilesFromLines(container, prefix, lines){
    container.innerHTML = "";
    lines.forEach(function(cl){
      container.appendChild(statTile(prefix+" O"+cl.line, pct(cl.over), cl.over, true));
    });
  }

  // ---------- Resolve the fixture from the URL ----------
  function resolveMatch(){
    if(comp.type==="league"){
      var matches = E.currentLeagueMatches(comp.id);
      var idx = params.idx!=null ? Number(params.idx) : NaN;
      var m = isNaN(idx) ? null : matches.filter(function(mm){ return mm.idx===idx; })[0];
      if(!m) m = matches.filter(function(mm){ return !mm.played; })[0] || matches[0];
      return {
        homeTeam: E.teamByName(comp.id, m.home), awayTeam: E.teamByName(comp.id, m.away),
        matchInfo: m
      };
    }
    var pool = E.poolFor(comp.id);
    var home = params.home ? pool.filter(function(t){ return t.name===params.home; })[0] : null;
    var away = params.away ? pool.filter(function(t){ return t.name===params.away; })[0] : null;
    if(!home) home = pool[0];
    if(!away) away = pool[1] || pool[0];
    return { homeTeam: home, awayTeam: away, matchInfo: null };
  }

  // ---------- Mini switcher (navigates, doesn't mutate in place) ----------
  function renderCompSelect(){
    var sel = document.getElementById("compSelect");
    if(sel.options.length===0){
      var groups = { league:"Leagues (real fixtures)", euro:"European competitions", cup:"Domestic cups" };
      var lastGroup = null, optgroup = null;
      E.COMPETITIONS.forEach(function(c){
        if(c.type!==lastGroup){
          optgroup = el("optgroup", {label: groups[c.type]});
          sel.appendChild(optgroup);
          lastGroup = c.type;
        }
        optgroup.appendChild(el("option", {value:c.id}, c.label));
      });
      sel.addEventListener("change", function(){
        window.location.href = matchUrl(sel.value, {});
      });
    }
    sel.value = comp.id;
    document.getElementById("matchListWrap").style.display = comp.type==="league" ? "" : "none";
    document.getElementById("teamPickWrap").style.display = comp.type==="league" ? "none" : "";
  }

  function renderMatchList(current){
    var wrap = document.getElementById("matchList");
    wrap.innerHTML = "";
    var matches = E.currentLeagueMatches(comp.id);
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
      var isActive = current.matchInfo && m.idx===current.matchInfo.idx;
      var row = el("a", {"class":"match-row"+(isActive?" active":""), "href": matchUrl(comp.id, {idx:m.idx})});
      var scoreHtml = m.played
        ? '<span class="match-score">'+m.hg+' – '+m.ag+'</span>'
        : '<span class="match-kickoff">'+(m.kickoff||"")+'</span>';
      row.innerHTML =
        '<span class="match-team home">'+m.home+'</span>' +
        scoreHtml +
        '<span class="match-team away">'+m.away+'</span>' +
        (m.played ? '<span class="ft-pill">FT</span>' : '');
      wrap.appendChild(row);
    });
  }

  function renderTeamPick(current){
    var pool = E.poolFor(comp.id);
    var homeIdx = Math.max(0, pool.indexOf(current.homeTeam));
    var awayIdx = Math.max(0, pool.indexOf(current.awayTeam));
    var homeSel = document.getElementById("homeSelect");
    var awaySel = document.getElementById("awaySelect");
    [homeSel, awaySel].forEach(function(sel){
      sel.innerHTML = "";
      pool.forEach(function(t, idx){
        var label = t.name + (t.leagueName && (comp.id==="ucl"||comp.id==="uel") ? " ("+t.leagueName+")" : "");
        sel.appendChild(el("option", {value:idx}, label));
      });
    });
    homeSel.value = homeIdx; awaySel.value = awayIdx;
    document.getElementById("freePickGo").onclick = function(){
      var h = pool[Number(homeSel.value)], a = pool[Number(awaySel.value)];
      window.location.href = matchUrl(comp.id, { home:h.name, away:a.name });
    };
    homeSel.onchange = awaySel.onchange = document.getElementById("freePickGo").onclick;
    document.getElementById("swapBtn").onclick = function(){
      window.location.href = matchUrl(comp.id, { home: current.awayTeam.name, away: current.homeTeam.name });
    };

    var row = document.getElementById("rivalryRow");
    row.innerHTML = "";
    var pairs = E.RIVALRIES[comp.id] || [];
    if(pairs.length){
      row.appendChild(el("span", {"class":"r-label"}, "Example matchups"));
      pairs.forEach(function(pair){
        var chip = el("a", {"class":"rivalry-chip", "href": matchUrl(comp.id, {home:pair[0], away:pair[1]})}, pair[0]+" v "+pair[1]);
        row.appendChild(chip);
      });
    }
  }

  // ---------- Referee ----------
  function renderRefSelect(){
    var poolKey = E.refLeagueKeyFor(comp) || "euro-fallback";
    var pool = E.refPoolFor(comp);
    var sel = document.getElementById("refSelect");
    if(state.refPoolKey !== poolKey){
      state.refPoolKey = poolKey;
      var best = 0, bestDist = Infinity;
      pool.forEach(function(r, i){ var d = Math.abs(r.mult-1); if(d<bestDist){ bestDist=d; best=i; } });
      state.refIdx = best;
      sel.innerHTML = "";
      pool.forEach(function(r, i){ sel.appendChild(el("option", {value:String(i)}, r.name)); });
    }
    sel.value = String(state.refIdx);
    if(!sel._bound){
      sel.addEventListener("change", function(){ state.refIdx = Number(sel.value); renderAll(); });
      sel._bound = true;
    }
    var ref = pool[state.refIdx] || pool[0];
    var cpgTxt = (typeof ref.cpg === "number") ? (ref.cpg.toFixed(1)+" cards/game · ") : "";
    document.getElementById("refHint").textContent = cpgTxt + ref.tendency;
    return ref;
  }

  // ---------- Free tier ----------
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

  function renderFree(model, matchInfo){
    document.title = model.home.name+" v "+model.away.name+" — PitchCheck";
    document.getElementById("pageTitle").textContent = model.home.name+" v "+model.away.name;
    var subText = comp.label + (matchInfo ? " · " + fmtDateShort(matchInfo.date) + (!matchInfo.played && matchInfo.kickoff ? ", "+matchInfo.kickoff : "") : " · Free pick");
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

  // ---------- Premium tabs ----------
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
    E.GOAL_LINES.forEach(function(L){ g.appendChild(miniRow("Over "+L+" goals", pct(model.goalOver[L]))); });

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

  function heatColor(t, lo, hi){
    function hex2rgb(h){ h=h.replace('#',''); return [parseInt(h.substring(0,2),16),parseInt(h.substring(2,4),16),parseInt(h.substring(4,6),16)]; }
    var c1=hex2rgb(lo), c2=hex2rgb(hi);
    var r=Math.round(c1[0]+(c2[0]-c1[0])*t), g=Math.round(c1[1]+(c2[1]-c1[1])*t), b=Math.round(c1[2]+(c2[2]-c1[2])*t);
    var lum = (0.299*r+0.587*g+0.114*b)/255;
    return { bg:"rgb("+r+","+g+","+b+")", text: lum>0.55 ? "#0A130D" : "#EEF5EF" };
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
    var lo = styles.getPropertyValue("--heat-lo").trim() || "#16241A";
    var hi = styles.getPropertyValue("--heat-hi").trim() || "#34D67C";
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

  function renderCardsTab(model){
    document.getElementById("cardsNote").textContent =
      "Combined match total with the selected referee applied — "+model.home.name+" "+model.homeCardsLambda.toFixed(1)+" vs "+model.away.name+" "+model.awayCardsLambda.toFixed(1)+" cards/game baseline.";
    tilesFromLines(document.getElementById("cardsTiles"), "Cards", model.cardLines);
  }

  function renderCornersShotsTab(model){
    tilesFromLines(document.getElementById("cornersTiles"), "Corners", model.corners.combinedLines);
    document.getElementById("cornersHomeLabel").textContent = "Corners — "+model.home.name;
    document.getElementById("cornersAwayLabel").textContent = "Corners — "+model.away.name;
    tilesFromLines(document.getElementById("cornersHomeTiles"), "Corners", model.corners.homeLines);
    tilesFromLines(document.getElementById("cornersAwayTiles"), "Corners", model.corners.awayLines);

    document.getElementById("sotHomeLabel").textContent = "Shots on target — "+model.home.name;
    document.getElementById("sotAwayLabel").textContent = "Shots on target — "+model.away.name;
    tilesFromLines(document.getElementById("sotHomeTiles"), "SOT", model.sot.homeLines);
    tilesFromLines(document.getElementById("sotAwayTiles"), "SOT", model.sot.awayLines);

    document.getElementById("savesHomeLabel").textContent = model.home.name+" goalkeeper saves";
    document.getElementById("savesAwayLabel").textContent = model.away.name+" goalkeeper saves";
    tilesFromLines(document.getElementById("savesHomeTiles"), "Saves", model.saves.homeLines);
    tilesFromLines(document.getElementById("savesAwayTiles"), "Saves", model.saves.awayLines);
  }

  function renderPlayersTab(model){
    var body = document.getElementById("playersBody");
    body.innerHTML = "";
    model.players.forEach(function(p){
      var tr = el("tr", {});
      tr.innerHTML =
        '<td><span class="player-name">'+p.name+'</span> <span class="pos-tag '+p.pos.toLowerCase()+'">'+p.pos+'</span></td>' +
        '<td>'+p.team+'</td>' +
        '<td class="pct">'+pct(p.toScoreP)+'</td>' +
        '<td class="pct">'+pct(p.assistP)+'</td>' +
        '<td class="pct">'+pct(p.sotP)+'</td>' +
        '<td class="pct">'+pct(p.bookedP)+'</td>' +
        '<td class="pct">'+pct(p.foulsP)+'</td>' +
        '<td class="pct">'+pct(p.fouledP)+'</td>' +
        '<td class="pct">'+(p.savesP!=null ? pct(p.savesP) : '—')+'</td>';
      body.appendChild(tr);
    });
  }

  function renderMarketTabs(){
    var wrap = document.getElementById("marketTabs");
    if(wrap.children.length===0){
      E.TABS.forEach(function(t){
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
    renderCardsTab(model);
    renderCornersShotsTab(model);
    renderPlayersTab(model);
  }

  // ---------- Acca ----------
  function renderAcca(model, matchInfo){
    var addRow = document.getElementById("accaMarkets");
    var label = document.getElementById("accaCurrentLabel");
    var playedNotice = document.getElementById("accaPlayedNotice");

    if(matchInfo && matchInfo.played){
      addRow.innerHTML = "";
      label.textContent = "This match has been played";
      playedNotice.textContent = "Pick an upcoming fixture to add legs to your accumulator — your existing slip is unaffected.";
      playedNotice.classList.add("show");
      return;
    }
    playedNotice.classList.remove("show");

    label.textContent = "Add from " + model.home.name + " v " + model.away.name + " (" + comp.label + ")";
    addRow.innerHTML = "";
    var c45 = model.cardLines.filter(function(c){ return c.line===4.5; })[0];
    var corners95 = model.corners.combinedLines.filter(function(c){ return c.line===9.5; })[0];
    var topScorer = model.players.slice().sort(function(a,b){ return b.toScoreP-a.toScoreP; })[0];
    var matchKey = comp.id+"|"+(matchInfo?matchInfo.date:"free")+"|"+model.home.name+"|"+model.away.name;
    var markets = [
      { key:"home", prob:model.homeWin, label:model.home.name+" win" },
      { key:"away", prob:model.awayWin, label:model.away.name+" win" },
      { key:"dc1x", prob:model.dcHD, label:model.home.name+" or draw" },
      { key:"over25", prob:model.goalOver[2.5], label:"Over 2.5 goals" },
      { key:"btts", prob:model.btts, label:"BTTS yes" },
      { key:"cardsU45", prob:1-c45.over, label:"Under 4.5 cards" },
      { key:"corners95", prob:corners95.over, label:"Over 9.5 corners" },
      { key:"scorer", prob:topScorer.toScoreP, label:topScorer.name+" to score" }
    ];
    markets.forEach(function(m){
      var legKey = matchKey+"|"+m.key;
      var added = ACCA.hasLeg(legKey);
      var btn = el("button", {"class":"market-btn", "aria-pressed": String(added), "data-leg": legKey});
      btn.innerHTML = m.label+' <span class="p mono">'+pct(m.prob)+'</span>';
      btn.addEventListener("click", function(){
        ACCA.toggleLeg({ key:legKey, label:model.home.name+" v "+model.away.name+" — "+m.label, prob:m.prob, matchKey:matchKey });
        renderAcca(model, matchInfo);
      });
      addRow.appendChild(btn);
    });
  }

  function renderTierUI(){
    var tier = ACCA.getTier();
    document.querySelector(".page").setAttribute("data-tier", tier);
    document.querySelectorAll("[data-set-tier]").forEach(function(btn){
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-set-tier")===tier));
    });
  }

  function renderSlips(){
    ACCA.renderSlip(document.getElementById("slipFull"), { compact:false });
    ACCA.renderSlip(document.getElementById("slipBar"), { compact:true });
  }

  var currentModel = null, currentMatchInfo = null;

  function renderAll(){
    renderCompSelect();
    var resolved = resolveMatch();
    if(comp.type==="league") renderMatchList(resolved); else renderTeamPick(resolved);

    var ref = renderRefSelect();
    var avgGoals = E.avgGoalsFor(comp);
    var model = E.buildModel(resolved.homeTeam, resolved.awayTeam, ref.mult, avgGoals, comp.type==="euro");
    currentModel = model; currentMatchInfo = resolved.matchInfo;

    renderFree(model, resolved.matchInfo);
    renderPremium(model);
    renderAcca(model, resolved.matchInfo);
    renderTierUI();
    renderSlips();
  }

  document.querySelectorAll("[data-set-tier]").forEach(function(btn){
    btn.addEventListener("click", function(){ ACCA.setTier(btn.getAttribute("data-set-tier")); renderTierUI(); });
  });
  ACCA.onChange(function(){
    renderSlips();
    if(currentModel) renderAcca(currentModel, currentMatchInfo);
  });

  renderAll();
})();
