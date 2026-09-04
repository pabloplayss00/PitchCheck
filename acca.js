/* PitchCheck acca — the bet slip is shared across every page (the fixtures
 * hub and every match page) via localStorage, so a leg added on one match
 * survives navigating to another match or back to the hub. This file owns
 * that storage plus a single slip-widget renderer both pages call.
 */
(function (global) {
  "use strict";
  var KEY = "pitchcheck_acca_v1";
  var TIER_KEY = "pitchcheck_tier_v1";

  function read(){
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e){ return []; }
  }
  function write(legs){
    try { localStorage.setItem(KEY, JSON.stringify(legs)); } catch(e){ /* storage unavailable — slip just won't persist */ }
  }

  function getLegs(){ return read(); }
  function hasLeg(key){ return read().some(function(l){ return l.key===key; }); }
  function addLeg(leg){
    var legs = read();
    if(!legs.some(function(l){ return l.key===leg.key; })){ legs.push(leg); write(legs); }
    notify();
  }
  function removeLeg(key){
    write(read().filter(function(l){ return l.key!==key; }));
    notify();
  }
  function toggleLeg(leg){
    if(hasLeg(leg.key)) removeLeg(leg.key); else addLeg(leg);
  }
  function clear(){ write([]); notify(); }

  function combined(){
    return read().reduce(function(acc,l){ return acc*l.prob; }, 1);
  }

  function getTier(){
    try { return localStorage.getItem(TIER_KEY) || "free"; } catch(e){ return "free"; }
  }
  function setTier(t){
    try { localStorage.setItem(TIER_KEY, t); } catch(e){ /* ignore */ }
    notify();
  }

  var listeners = [];
  function onChange(fn){ listeners.push(fn); }
  function notify(){ listeners.forEach(function(fn){ fn(); }); }

  // Cross-tab/cross-page sync: another page in the same browser changing
  // the slip fires a "storage" event here, so a still-open tab stays current.
  global.addEventListener("storage", function(e){
    if(e.key===KEY || e.key===TIER_KEY) notify();
  });

  function pct(x){ return Math.round(x*100)+"%"; }

  // Renders the shared slip widget into `container`. `opts.compact` shows a
  // one-line summary bar (used as the sticky bar on the fixtures hub);
  // otherwise renders the full leg list + combined result (used in the
  // Accumulator Builder panel on a match page).
  function renderSlip(container, opts){
    opts = opts || {};
    var legs = read();
    var comb = combined();

    if(opts.compact){
      container.innerHTML = "";
      var bar = document.createElement("div");
      bar.className = "slip-bar";
      bar.innerHTML =
        '<span class="sb-count">' + legs.length + ' leg' + (legs.length===1?"":"s") + '</span>' +
        '<span class="sb-sep">·</span>' +
        '<span class="sb-label">Combined</span><span class="sb-v mono">' + (legs.length?pct(comb):"—") + '</span>' +
        '<span class="sb-sep">·</span>' +
        '<span class="sb-label">Odds</span><span class="sb-v mono">' + (legs.length && comb>0 ? (1/comb).toFixed(2) : "—") + '</span>';
      container.appendChild(bar);
      container.classList.toggle("has-legs", legs.length>0);
      return;
    }

    container.innerHTML = "";
    var list = document.createElement("ul");
    list.className = "slip-legs";
    if(legs.length===0){
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No legs added yet — pick markets on any match page.";
      list.appendChild(empty);
    } else {
      legs.forEach(function(l){
        var li = document.createElement("li");
        li.className = "slip-leg";
        li.innerHTML = '<span class="txt">'+l.label+'</span><span class="p mono">'+pct(l.prob)+'</span>';
        var rm = document.createElement("button");
        rm.setAttribute("aria-label","Remove leg");
        rm.type = "button";
        rm.innerHTML = "&times;";
        rm.addEventListener("click", function(){ removeLeg(l.key); });
        li.appendChild(rm);
        list.appendChild(li);
      });
    }
    container.appendChild(list);

    var result = document.createElement("div");
    result.className = "slip-result";
    result.innerHTML =
      '<div class="row"><span>Legs</span><span class="v mono">'+legs.length+'</span></div>' +
      '<div class="row big"><span>Combined chance</span><span class="v mono">'+(legs.length?pct(comb):"—")+'</span></div>' +
      '<div class="row"><span>Model-implied odds</span><span class="v mono">'+(legs.length && comb>0 ? (1/comb).toFixed(2) : "—")+'</span></div>';
    container.appendChild(result);

    var matchKeys = legs.map(function(l){ return l.matchKey; });
    var hasDup = matchKeys.some(function(id,i){ return matchKeys.indexOf(id)!==i; });
    if(hasDup){
      var note = document.createElement("p");
      note.className = "slip-note show";
      note.textContent = "Two or more legs from the same match aren't independent events — treat the combined figure as indicative only.";
      container.appendChild(note);
    }
    if(legs.length>0){
      var clearBtn = document.createElement("button");
      clearBtn.className = "slip-clear";
      clearBtn.type = "button";
      clearBtn.textContent = "Clear slip";
      clearBtn.addEventListener("click", clear);
      container.appendChild(clearBtn);
    }
  }

  global.PC_ACCA = {
    getLegs: getLegs, hasLeg: hasLeg, addLeg: addLeg, removeLeg: removeLeg, toggleLeg: toggleLeg,
    clear: clear, combined: combined, onChange: onChange, renderSlip: renderSlip,
    getTier: getTier, setTier: setTier
  };
})(window);
