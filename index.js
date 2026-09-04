/* PitchCheck — fixtures & competitions hub (index.html). Browsing only:
 * picking a fixture navigates to match.html, which owns the odds/markets
 * and the acca leg controls. The bet slip itself is shared state (acca.js)
 * so it's shown here too, as a compact summary bar.
 */
(function () {
  "use strict";
  var E = window.PC_ENGINE, ACCA = window.PC_ACCA;

  var state = { compId: "epl", homeIdx: 0, awayIdx: 1 };

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
  function matchUrl(compId, params){
    var q = ["comp="+encodeURIComponent(compId)];
    Object.keys(params).forEach(function(k){ q.push(k+"="+encodeURIComponent(params[k])); });
    return "match.html?"+q.join("&");
  }

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
        state.compId = sel.value;
        var pool = E.poolFor(state.compId);
        state.homeIdx = 0; state.awayIdx = Math.min(1, pool.length-1);
        renderAll();
      });
    }
    sel.value = state.compId;

    var comp = E.compOf(state.compId);
    var noteEl = document.getElementById("compNote");
    if(comp.type==="cup"){
      var cup = E.CUPS.filter(function(c){ return c.id===state.compId; })[0];
      noteEl.textContent = cup.note;
      noteEl.classList.add("show");
    } else if(comp.type==="euro"){
      noteEl.textContent = "Field limited to clubs from the five leagues modelled above (top 4 per league for the Champions League, next 2 for the Europa League), with a cross-league strength adjustment — not the real draw.";
      noteEl.classList.add("show");
    } else {
      noteEl.textContent = "Real 2026-27 results and fixtures as of " + fmtDate(E.D.SNAPSHOT_DATE) + ".";
      noteEl.classList.add("show");
    }

    document.getElementById("matchListWrap").style.display = comp.type==="league" ? "" : "none";
    document.getElementById("teamPickWrap").style.display = comp.type==="league" ? "none" : "";
  }

  function renderMatchList(){
    var wrap = document.getElementById("matchList");
    wrap.innerHTML = "";
    var matches = E.currentLeagueMatches(state.compId);
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
      var row = el("a", {"class":"match-row", "href": matchUrl(state.compId, {idx:m.idx})});
      var scoreHtml = m.played
        ? '<span class="match-score">'+m.hg+' – '+m.ag+'</span>'
        : '<span class="match-kickoff">'+(m.kickoff||"")+'</span>';
      row.innerHTML =
        '<span class="match-team home">'+m.home+'</span>' +
        scoreHtml +
        '<span class="match-team away">'+m.away+'</span>' +
        (m.played ? '<span class="ft-pill">FT</span>' : '<span class="ft-pill">View odds →</span>');
      wrap.appendChild(row);
    });
  }

  function renderTeamPick(){
    var pool = E.poolFor(state.compId);
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

    homeSel.onchange = function(){ state.homeIdx = Number(homeSel.value); if(state.awayIdx===state.homeIdx){ state.awayIdx=(state.homeIdx+1)%pool.length; awaySel.value=state.awayIdx; } };
    awaySel.onchange = function(){ state.awayIdx = Number(awaySel.value); if(state.awayIdx===state.homeIdx){ state.homeIdx=(state.awayIdx+1)%pool.length; homeSel.value=state.homeIdx; } };

    document.getElementById("swapBtn").onclick = function(){
      var t = state.homeIdx; state.homeIdx = state.awayIdx; state.awayIdx = t;
      homeSel.value = state.homeIdx; awaySel.value = state.awayIdx;
    };
    document.getElementById("freePickGo").onclick = function(){
      var h = pool[state.homeIdx], a = pool[state.awayIdx];
      window.location.href = matchUrl(state.compId, { home:h.name, away:a.name });
    };

    var row = document.getElementById("rivalryRow");
    row.innerHTML = "";
    var pairs = E.RIVALRIES[state.compId] || [];
    if(pairs.length){
      row.appendChild(el("span", {"class":"r-label"}, "Example matchups"));
      pairs.forEach(function(pair){
        var chip = el("a", {"class":"rivalry-chip", "href": matchUrl(state.compId, {home:pair[0], away:pair[1]})}, pair[0]+" v "+pair[1]);
        row.appendChild(chip);
      });
    }
  }

  function renderTierUI(){
    var tier = ACCA.getTier();
    document.querySelector(".page").setAttribute("data-tier", tier);
    document.querySelectorAll("[data-set-tier]").forEach(function(btn){
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-set-tier")===tier));
    });
  }

  function renderSlipBar(){
    ACCA.renderSlip(document.getElementById("slipBar"), { compact:true });
  }

  function renderAll(){
    renderCompSelect();
    var comp = E.compOf(state.compId);
    if(comp.type==="league") renderMatchList(); else renderTeamPick();
    renderTierUI();
    renderSlipBar();
  }

  document.querySelectorAll("[data-set-tier]").forEach(function(btn){
    btn.addEventListener("click", function(){ ACCA.setTier(btn.getAttribute("data-set-tier")); renderTierUI(); });
  });
  ACCA.onChange(renderSlipBar);

  renderAll();
})();
