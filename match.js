/* PitchCheck — single match page (match.html). Reads which fixture to show
 * from the URL (?comp=...&idx=... for a league fixture, or
 * ?comp=...&home=...&away=... for a free-pick competition), builds the
 * model via engine.js, and renders the page scoped to just that match —
 * every value across the Every Market tabs doubles as an acca-leg toggle
 * (see pickable()/refreshPicked() below), so there's no separate quick-add
 * row. Navigation back to other fixtures is the "All fixtures" link to
 * index.html; the acca slip (acca.js) is shared storage, so legs survive
 * that navigation either way.
 */
(function () {
  "use strict";
  var E = window.PC_ENGINE, ACCA = window.PC_ACCA;

  function qs(){
    var p = new URLSearchParams(window.location.search);
    return { comp: p.get("comp")||"epl", idx: p.get("idx"), home: p.get("home"), away: p.get("away") };
  }

  var params = qs();
  var comp = E.compOf(params.comp) || E.compOf("epl");
  var state = { activeTab:"result", refPoolKey:null, refIdx:0 };
  var currentModel = null, currentMatchInfo = null, matchKey = null, matchPlayable = true;

  function el(tag, attrs, html){
    var e = document.createElement(tag);
    for(var k in attrs){ e.setAttribute(k, attrs[k]); }
    if(html!=null) e.innerHTML = html;
    return e;
  }
  function fmtDateShort(dateStr){
    var d = new Date(dateStr+"T12:00:00");
    return d.toLocaleDateString(undefined, { weekday:"short", day:"numeric", month:"short" });
  }
  function pct(x){ return E.pct(x); }

  // ---------- Click-to-add: every market value doubles as an acca toggle ----------
  // `shortKey` identifies the market within this match; fullKey() namespaces
  // it to the current fixture so the same market on a different match (or a
  // different referee's cards line) is a distinct leg. Rows/tiles/cells are
  // only made interactive when the match hasn't been played yet.
  function fullKey(shortKey){ return matchKey + "|" + shortKey; }
  function legLabel(text){ return currentModel.home.name+" v "+currentModel.away.name+" — "+text; }
  function pickable(node, shortKey, legText, prob){
    if(!matchPlayable || shortKey==null) return;
    var legKey = fullKey(shortKey);
    var leg = { key: legKey, label: legLabel(legText), prob: prob, matchKey: matchKey };
    node.classList.add("pickable");
    node.setAttribute("data-leg-key", legKey);
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-pressed", String(ACCA.hasLeg(legKey)));
    if(ACCA.hasLeg(legKey)) node.classList.add("picked");
    function toggle(e){ e.preventDefault(); ACCA.toggleLeg(leg); refreshPicked(); }
    node.addEventListener("click", toggle);
    node.addEventListener("keydown", function(e){ if(e.key==="Enter" || e.key===" "){ toggle(e); } });
  }
  function refreshPicked(){
    document.querySelectorAll("[data-leg-key]").forEach(function(node){
      var picked = ACCA.hasLeg(node.getAttribute("data-leg-key"));
      node.classList.toggle("picked", picked);
      node.setAttribute("aria-pressed", String(picked));
    });
  }

  function miniRow(label, value, sub, shortKey, prob, legText){
    var li = el("li", {});
    li.innerHTML = '<span>'+label+(sub?'<span class="sub">'+sub+'</span>':'')+'</span><span class="v mono">'+value+'</span>';
    pickable(li, shortKey, legText || (label+(sub?" — "+sub:"")), prob);
    return li;
  }
  function statTile(label, value, ratio, premium, shortKey, prob){
    var tile = el("div", {"class":"stat-tile"+(premium?" premium-hue":"")});
    tile.innerHTML =
      '<div class="label">'+label+'</div>' +
      '<div class="value mono">'+value+'</div>' +
      '<div class="meter"><i style="width:'+Math.round(ratio*100)+'%"></i></div>';
    pickable(tile, shortKey, label, prob);
    return tile;
  }
  function tilesFromLines(container, prefix, lines, keyPrefix){
    container.innerHTML = "";
    lines.forEach(function(cl){
      var shortKey = keyPrefix ? (keyPrefix+"_"+cl.line) : null;
      container.appendChild(statTile(prefix+" O"+cl.line, pct(cl.over), cl.over, true, shortKey, cl.over));
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

    document.getElementById("likelyScore").textContent = model.home.name+" "+model.bestScore.replace("-", " – ")+" "+model.away.name+" ("+pct(model.bestScoreP)+")";
  }

  // ---------- Premium tabs ----------
  function renderResultTab(model){
    var r = document.getElementById("mrResult"); r.innerHTML = "";
    r.appendChild(miniRow(model.home.name+" win", pct(model.homeWin), null, "home", model.homeWin));
    r.appendChild(miniRow("Draw", pct(model.draw), null, "draw", model.draw));
    r.appendChild(miniRow(model.away.name+" win", pct(model.awayWin), null, "away", model.awayWin));

    var d = document.getElementById("mrDouble"); d.innerHTML = "";
    d.appendChild(miniRow(model.home.name+" or Draw", pct(model.dcHD), "Double chance 1X", "dc1x", model.dcHD));
    d.appendChild(miniRow(model.away.name+" or Draw", pct(model.dcAD), "Double chance X2", "dc2x", model.dcAD));
    d.appendChild(miniRow(model.home.name+" or "+model.away.name, pct(model.dcHA), "Double chance 12", "dc12", model.dcHA));
    d.appendChild(miniRow("Draw no bet — "+model.home.name, pct(model.dnbHome), null, "dnbHome", model.dnbHome));
    d.appendChild(miniRow("Draw no bet — "+model.away.name, pct(model.dnbAway), null, "dnbAway", model.dnbAway));
  }

  function renderGoalsTab(model){
    var g = document.getElementById("mrGoals"); g.innerHTML = "";
    E.GOAL_LINES.forEach(function(L){
      g.appendChild(miniRow("Over "+L+" goals", pct(model.goalOver[L]), null, "over"+L, model.goalOver[L]));
    });

    var b = document.getElementById("mrBtts"); b.innerHTML = "";
    b.appendChild(miniRow("Yes", pct(model.btts), null, "bttsYes", model.btts, "Both teams to score — Yes"));
    b.appendChild(miniRow("No", pct(model.bttsNo), null, "bttsNo", model.bttsNo, "Both teams to score — No"));

    var t = document.getElementById("mrTeamGoals"); t.innerHTML = "";
    t.appendChild(miniRow(model.home.name+" over 1.5 goals", pct(model.teamOverHome), null, "teamOverHome", model.teamOverHome));
    t.appendChild(miniRow(model.away.name+" over 1.5 goals", pct(model.teamOverAway), null, "teamOverAway", model.teamOverAway));
    t.appendChild(miniRow(model.home.name+" clean sheet", pct(model.cleanSheetHome), null, "csHome", model.cleanSheetHome));
    t.appendChild(miniRow(model.away.name+" clean sheet", pct(model.cleanSheetAway), null, "csAway", model.cleanSheetAway));
    t.appendChild(miniRow(model.home.name+" to win to nil", pct(model.winNilHome), null, "winNilHome", model.winNilHome));
    t.appendChild(miniRow(model.away.name+" to win to nil", pct(model.winNilAway), null, "winNilAway", model.winNilAway));
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
      pickable(li, "score_"+s.h+"-"+s.a, "Correct score "+s.h+"-"+s.a, s.p);
      list.appendChild(li);
    });
    var otherLi = el("li", {});
    otherLi.innerHTML = '<span class="rank"></span><span class="sc" style="width:auto;">Any other</span><span class="bar"></span><span class="p">'+pct(model.anyOther)+'</span>';
    pickable(otherLi, "score_other", "Any other correct score", model.anyOther);
    list.appendChild(otherLi);

    var table = document.getElementById("htftTable");
    table.innerHTML = "";
    var rows = ["H","D","A"];
    var labels = { H:model.home.name, D:"Draw", A:model.away.name };
    var thead = el("thead", {});
    var headTr = el("tr", {});
    headTr.appendChild(el("th", {}, "HT \\ FT"));
    rows.forEach(function(ft){ headTr.appendChild(el("th", {"class":"center"}, labels[ft])); });
    thead.appendChild(headTr);
    table.appendChild(thead);
    var tbody = el("tbody", {});
    rows.forEach(function(ht){
      var tr = el("tr", {});
      tr.appendChild(el("td", {}, labels[ht]));
      rows.forEach(function(ft){
        var v = model.htft[ht+ft];
        var isDiag = ht===ft;
        var td = el("td", {"class":"center"+(isDiag?" hi":"")}, pct(v));
        pickable(td, "htft_"+ht+ft, "HT/FT "+labels[ht]+" / "+labels[ft], v);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

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
        // Same key scheme as the correct-score list above: the grid is just
        // every scoreline (the list is only the top few), so the same
        // scoreline picked in either widget shows as picked in both.
        pickable(cell, "score_"+i+"-"+j, "Correct score "+i+"-"+j, model.grid[i][j]);
        hm.appendChild(cell);
      }
    }
  }

  function renderHandicapTab(model){
    var table = document.getElementById("hcapTable");
    table.innerHTML = "";
    var thead = el("thead", {});
    var headTr = el("tr", {});
    headTr.appendChild(el("th", {}, "Line"));
    headTr.appendChild(el("th", {"class":"pct"}, "Win"));
    headTr.appendChild(el("th", {"class":"pct"}, "Push"));
    thead.appendChild(headTr);
    table.appendChild(thead);
    var tbody = el("tbody", {});
    model.hcap.forEach(function(h){
      var label = "Home "+(h.line>0?"+":"")+h.line;
      var tr = el("tr", {});
      tr.appendChild(el("td", {}, label));
      var winTd = el("td", {"class":"pct"}, pct(h.win));
      pickable(winTd, "hcap_"+h.line, label+" win", h.win);
      tr.appendChild(winTd);
      tr.appendChild(el("td", {"class":"pct"}, h.push>0?pct(h.push):"—"));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function renderCardsTab(model){
    document.getElementById("cardsNote").textContent =
      "Combined match total with the selected referee applied — "+model.home.name+" "+model.homeCardsLambda.toFixed(1)+" vs "+model.away.name+" "+model.awayCardsLambda.toFixed(1)+" cards/game baseline.";
    tilesFromLines(document.getElementById("cardsTiles"), "Cards", model.cardLines, "cards");
  }

  function renderCornersShotsTab(model){
    tilesFromLines(document.getElementById("cornersTiles"), "Corners", model.corners.combinedLines, "corners");
    document.getElementById("cornersHomeLabel").textContent = "Corners — "+model.home.name;
    document.getElementById("cornersAwayLabel").textContent = "Corners — "+model.away.name;
    tilesFromLines(document.getElementById("cornersHomeTiles"), "Corners", model.corners.homeLines, "cornersHome");
    tilesFromLines(document.getElementById("cornersAwayTiles"), "Corners", model.corners.awayLines, "cornersAway");

    document.getElementById("sotHomeLabel").textContent = "Shots on target — "+model.home.name;
    document.getElementById("sotAwayLabel").textContent = "Shots on target — "+model.away.name;
    tilesFromLines(document.getElementById("sotHomeTiles"), "SOT", model.sot.homeLines, "sotHome");
    tilesFromLines(document.getElementById("sotAwayTiles"), "SOT", model.sot.awayLines, "sotAway");

    document.getElementById("savesHomeLabel").textContent = model.home.name+" goalkeeper saves";
    document.getElementById("savesAwayLabel").textContent = model.away.name+" goalkeeper saves";
    tilesFromLines(document.getElementById("savesHomeTiles"), "Saves", model.saves.homeLines, "savesHome");
    tilesFromLines(document.getElementById("savesAwayTiles"), "Saves", model.saves.awayLines, "savesAway");
  }

  function renderPlayersTab(model){
    var body = document.getElementById("playersBody");
    body.innerHTML = "";
    model.players.forEach(function(p){
      var tr = el("tr", {});
      var pKey = p.name.replace(/\s+/g,"_");
      tr.appendChild(el("td", {}, '<span class="player-name">'+p.name+'</span> <span class="pos-tag '+p.pos.toLowerCase()+'">'+p.pos+'</span>'));
      tr.appendChild(el("td", {}, p.team));

      var scoreTd = el("td", {"class":"pct"}, pct(p.toScoreP));
      pickable(scoreTd, "player_"+pKey+"_score", p.name+" to score", p.toScoreP);
      tr.appendChild(scoreTd);

      var assistTd = el("td", {"class":"pct"}, pct(p.assistP));
      pickable(assistTd, "player_"+pKey+"_assist", p.name+" to assist", p.assistP);
      tr.appendChild(assistTd);

      var sotTd = el("td", {"class":"pct"}, pct(p.sotP));
      pickable(sotTd, "player_"+pKey+"_sot", p.name+" 2+ shots on target", p.sotP);
      tr.appendChild(sotTd);

      var bookedTd = el("td", {"class":"pct"}, pct(p.bookedP));
      pickable(bookedTd, "player_"+pKey+"_booked", p.name+" to be booked", p.bookedP);
      tr.appendChild(bookedTd);

      var foulsTd = el("td", {"class":"pct"}, pct(p.foulsP));
      pickable(foulsTd, "player_"+pKey+"_fouls", p.name+" 2+ fouls committed", p.foulsP);
      tr.appendChild(foulsTd);

      var fouledTd = el("td", {"class":"pct"}, pct(p.fouledP));
      pickable(fouledTd, "player_"+pKey+"_fouled", p.name+" to be fouled", p.fouledP);
      tr.appendChild(fouledTd);

      var savesTd = el("td", {"class":"pct"}, p.savesP!=null ? pct(p.savesP) : "—");
      if(p.savesP!=null) pickable(savesTd, "player_"+pKey+"_saves", p.name+" 2+ saves", p.savesP);
      tr.appendChild(savesTd);

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

  // ---------- Acca hint / played notice ----------
  // The quick-add row is gone — every market value rendered above is itself
  // the add control (see pickable()). This just sets the intro line above
  // the slip and, for an already-played match, explains why nothing above
  // is clickable.
  function renderAccaHint(matchInfo){
    var label = document.getElementById("accaCurrentLabel");
    var playedNotice = document.getElementById("accaPlayedNotice");
    if(matchInfo && matchInfo.played){
      label.textContent = "This match has been played";
      playedNotice.textContent = "Pick an upcoming fixture to add legs to your accumulator — your existing slip is unaffected.";
      playedNotice.classList.add("show");
    } else {
      label.textContent = "Tap any value in Every Market above to add it to your slip";
      playedNotice.classList.remove("show");
    }
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

  function renderAll(){
    var resolved = resolveMatch();

    var ref = renderRefSelect();
    var avgGoals = E.avgGoalsFor(comp);
    var model = E.buildModel(resolved.homeTeam, resolved.awayTeam, ref.mult, avgGoals, comp.type==="euro");
    currentModel = model; currentMatchInfo = resolved.matchInfo;
    matchKey = comp.id+"|"+(resolved.matchInfo?resolved.matchInfo.date:"free")+"|"+model.home.name+"|"+model.away.name;
    matchPlayable = !(resolved.matchInfo && resolved.matchInfo.played);

    renderFree(model, resolved.matchInfo);
    renderPremium(model);
    renderAccaHint(resolved.matchInfo);
    renderTierUI();
    renderSlips();
  }

  document.querySelectorAll("[data-set-tier]").forEach(function(btn){
    btn.addEventListener("click", function(){ ACCA.setTier(btn.getAttribute("data-set-tier")); renderTierUI(); });
  });
  ACCA.onChange(function(){
    renderSlips();
    refreshPicked();
  });

  renderAll();
})();
