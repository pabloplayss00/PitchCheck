/* PitchCheck engine — shared by index.html (fixtures hub) and match.html
 * (single-match odds page). Pure data/model layer: builds the rated team
 * pools from data.js, runs the Poisson match model for every market, and
 * derives real-name player/referee figures. No DOM access in this file —
 * both pages import it as a plain <script> and read window.PC_ENGINE.
 */
(function (global) {
  "use strict";

  var D = global.FORMCHECK_DATA;
  var RAW_LEAGUES = D.RAW_LEAGUES, EURO_STRENGTH = D.EURO_STRENGTH, CUPS = D.CUPS, MATCHES = D.MATCHES;
  var ROSTERS = D.ROSTERS, REFEREES_BY_LEAGUE = D.REFEREES_BY_LEAGUE;

  var HOME_ADV = 1.12, AWAY_ADV = 0.94;
  var GOAL_LINES = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
  var CARD_LINES = [2.5, 3.5, 4.5, 5.5];
  var CORNER_LINES = [8.5, 9.5, 10.5, 11.5];
  var TEAM_CORNER_LINES = [3.5, 4.5, 5.5, 6.5];
  var SOT_LINES = [2.5, 3.5, 4.5, 5.5];
  var SAVE_LINES = [1.5, 2.5, 3.5, 4.5];
  var HANDICAP_LINES = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];
  var PROMOTED_DEFAULT = { attack: 0.84, defence: 1.18 };
  var FOULS_PER_CARD = 4.3; // roughly 4-5 fouls committed per card shown, professional average

  var TABS = [
    { id:"result", label:"Match Result" },
    { id:"goals", label:"Goals" },
    { id:"scorelines", label:"Scorelines" },
    { id:"handicap", label:"Handicap" },
    { id:"cards", label:"Cards" },
    { id:"corners", label:"Corners & Shots" },
    { id:"players", label:"Player Watch" }
  ];

  // Real referees, by league, with a sourced cards-per-game (cpg) figure and
  // a multiplier relative to that league's own referee-pool average (see
  // data.js header). Champions League / Europa League ties don't map onto a
  // single domestic list, so they fall back to a generic style picker.
  var FALLBACK_REFEREES = [
    { name:"Lenient style", mult:0.82, tendency:"Lets the game flow, cards sparingly" },
    { name:"Average style", mult:1.00, tendency:"Close to the league-average card rate" },
    { name:"Strict style", mult:1.30, tendency:"Quick to reach for cards" }
  ];
  function refLeagueKeyFor(comp){
    if(comp.type==="league") return comp.id;
    if(comp.type==="cup"){ var cup = CUPS.filter(function(c){ return c.id===comp.id; })[0]; return cup.leagueRef; }
    return null; // euro ties: no single real referee panel to draw from
  }
  function refPoolFor(comp){
    var key = refLeagueKeyFor(comp);
    return key ? REFEREES_BY_LEAGUE[key] : FALLBACK_REFEREES;
  }

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
      var sotAvg = clamp(4.0 + 2.4*(attack-1), 2.0, 8.5);
      return { name:name, league:key, leagueName:raw.short, attack:attack, defence:defence,
        cardsAvg:cardsAvg, cornersAvg:cornersAvg, sotAvg:sotAvg, promoted:promoted, pos: promoted?999:idx };
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

  function avgGoalsFor(comp){
    if(comp.type==="league") return LEAGUES[comp.id].avgGoals;
    if(comp.type==="euro") return EURO_AVG_GOALS;
    var cup = CUPS.filter(function(c){ return c.id===comp.id; })[0];
    return LEAGUES[cup.leagueRef].avgGoals;
  }

  function currentLeagueMatches(compId){
    return (MATCHES[compId] || []).map(function(m, idx){
      return { idx:idx, date:m[0], home:m[1], away:m[2], hg:m[3], ag:m[4], kickoff:m[5]||null, played: m[3]!=null };
    });
  }

  // ---------- Math ----------
  function fact(k){ var f=1; for(var i=2;i<=k;i++) f*=i; return f; }
  function poissonPMF(k,lambda){ return Math.exp(-lambda)*Math.pow(lambda,k)/fact(k); }
  function poissonCDF(k,lambda){ var s=0; for(var i=0;i<=k;i++) s+=poissonPMF(i,lambda); return s; }
  function atLeast(n, lambda){ return 1-poissonCDF(n-1, lambda); } // P(X >= n)
  function pct(x){ return Math.round(x*100)+"%"; }
  function poissonArr(lambda, n){
    var arr=[], sum=0, k;
    for(k=0;k<n;k++){ arr.push(poissonPMF(k,lambda)); sum+=arr[k]; }
    arr[n-1]+=Math.max(0,1-sum);
    return arr;
  }
  function overLines(lines, lambda){
    return lines.map(function(L){ return { line:L, over: 1-poissonCDF(Math.floor(L), lambda) }; });
  }

  // Fraction of a team's modelled goal / card / shot total attributed to
  // each position bucket as a whole (not to any one player).
  var POS_GOAL_SHARE   = { GK:0.005, DEF:0.06, MID:0.17, FWD:0.30 };
  var POS_ASSIST_SHARE = { GK:0,     DEF:0.03, MID:0.35, FWD:0.20 }; // share of team's goal lambda that becomes "an assist by this bucket"
  var POS_CARD_SHARE   = { GK:0.04,  DEF:0.30, MID:0.24, FWD:0.14 };
  var POS_SOT_SHARE    = { GK:0,     DEF:0.06, MID:0.24, FWD:0.45 };
  var POS_FOULED_SHARE = { GK:0,     DEF:0.10, MID:0.30, FWD:0.35 }; // share of the OPPONENT's fouls-committed total drawn by this bucket
  var POS_ORDER = ["GK","DEF","MID","FWD"];

  // Split a bucket's total across its real players with a mild rank decay
  // (the player listed first — the club's most prominent name at that
  // position — carries a somewhat larger share), not from per-player stats.
  function rankShares(n){
    var w = [], i;
    for(i=0;i<n;i++) w.push(1/Math.sqrt(i+1));
    var sum = w.reduce(function(a,b){ return a+b; }, 0);
    return w.map(function(v){ return v/sum; });
  }

  function playerRowsFor(team, teamGoalsLambda, oppFoulsLambda, savesLambda){
    var roster = ROSTERS[team.name] || [];
    var rows = [];
    POS_ORDER.forEach(function(pos){
      var group = roster.filter(function(p){ return p[1]===pos; });
      if(group.length===0) return;
      var shares = rankShares(group.length);
      var goalTotal   = POS_GOAL_SHARE[pos]*teamGoalsLambda;
      var assistTotal = POS_ASSIST_SHARE[pos]*teamGoalsLambda;
      var cardTotal   = POS_CARD_SHARE[pos]*team.cardsAvg;
      var foulTotal   = cardTotal*FOULS_PER_CARD;
      var sotTotal    = POS_SOT_SHARE[pos]*team.sotAvg;
      var fouledTotal = POS_FOULED_SHARE[pos]*oppFoulsLambda;
      group.forEach(function(player, i){
        var s = shares[i];
        rows.push({
          name: player[0], pos: pos, team: team.name,
          toScoreP: atLeast(1, goalTotal*s),
          assistP:  atLeast(1, assistTotal*s),
          sotP:     atLeast(2, sotTotal*s),
          bookedP:  atLeast(1, cardTotal*s),
          foulsP:   atLeast(2, foulTotal*s),
          fouledP:  atLeast(1, fouledTotal*s),
          savesP:   pos==="GK" ? atLeast(3, savesLambda) : null
        });
      });
    });
    return rows;
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
    var cardLines = overLines(CARD_LINES, cardsLambda);
    var homeCardsLambda = homeTeam.cardsAvg*refMult, awayCardsLambda = awayTeam.cardsAvg*refMult;

    var cornersLambda = homeTeam.cornersAvg+awayTeam.cornersAvg;
    var cornerLines = overLines(CORNER_LINES, cornersLambda);
    var corners = {
      combinedLines: cornerLines,
      homeLines: overLines(TEAM_CORNER_LINES, homeTeam.cornersAvg),
      awayLines: overLines(TEAM_CORNER_LINES, awayTeam.cornersAvg)
    };

    var sot = {
      homeLambda: homeTeam.sotAvg, awayLambda: awayTeam.sotAvg,
      homeLines: overLines(SOT_LINES, homeTeam.sotAvg),
      awayLines: overLines(SOT_LINES, awayTeam.sotAvg)
    };

    var homeSavesLambda = Math.max(0.6, awayTeam.sotAvg - aLambda*0.85);
    var awaySavesLambda = Math.max(0.6, homeTeam.sotAvg - hLambda*0.85);
    var saves = {
      homeLambda: homeSavesLambda, awayLambda: awaySavesLambda,
      homeLines: overLines(SAVE_LINES, homeSavesLambda),
      awayLines: overLines(SAVE_LINES, awaySavesLambda)
    };

    var homeFoulsLambda = homeTeam.cardsAvg*refMult*FOULS_PER_CARD;
    var awayFoulsLambda = awayTeam.cardsAvg*refMult*FOULS_PER_CARD;

    var players = playerRowsFor(homeTeam, hLambda, awayFoulsLambda, homeSavesLambda)
      .concat(playerRowsFor(awayTeam, aLambda, homeFoulsLambda, awaySavesLambda));

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
      cardsLambda:cardsLambda, cardLines:cardLines, homeCardsLambda:homeCardsLambda, awayCardsLambda:awayCardsLambda,
      cornersLambda:cornersLambda, cornerLines:cornerLines, corners:corners,
      sot:sot, saves:saves,
      homeFoulsLambda:homeFoulsLambda, awayFoulsLambda:awayFoulsLambda,
      players:players
    };
  }

  global.PC_ENGINE = {
    D: D, LEAGUES: LEAGUES, COMPETITIONS: COMPETITIONS, CUPS: CUPS, RIVALRIES: RIVALRIES,
    UCL_TEAMS: UCL_TEAMS, UEL_TEAMS: UEL_TEAMS, EURO_AVG_GOALS: EURO_AVG_GOALS,
    TABS: TABS, GOAL_LINES: GOAL_LINES, CARD_LINES: CARD_LINES, CORNER_LINES: CORNER_LINES,
    TEAM_CORNER_LINES: TEAM_CORNER_LINES, SOT_LINES: SOT_LINES, SAVE_LINES: SAVE_LINES,
    HANDICAP_LINES: HANDICAP_LINES,
    compOf: compOf, poolFor: poolFor, avgGoalsFor: avgGoalsFor, teamByName: teamByName,
    currentLeagueMatches: currentLeagueMatches,
    refLeagueKeyFor: refLeagueKeyFor, refPoolFor: refPoolFor,
    buildModel: buildModel, pct: pct, atLeast: atLeast
  };
})(window);
