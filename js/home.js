(function(){
  var split = document.querySelector('.split');
  var panels = Array.prototype.slice.call(document.querySelectorAll('.split .panel'));
  var mq = window.matchMedia('(max-width:820px)');

  function isMobile(){ return mq.matches; }

  function expand(panel){
    split.classList.add('is-picked');
    panels.forEach(function(p){ p.classList.toggle('is-expanded', p === panel); });
  }

  panels.forEach(function(panel){
    var link = panel.querySelector('.panel__stretch');
    link.addEventListener('click', function(e){
      if (!isMobile()) return;
      if (!panel.classList.contains('is-expanded')){
        e.preventDefault();
        expand(panel);
      }
    });
  });

  var touchStartY = null;
  split.addEventListener('touchstart', function(e){
    touchStartY = e.touches[0].clientY;
  }, {passive:true});

  split.addEventListener('touchend', function(e){
    if (!isMobile() || touchStartY === null) return;
    var dy = touchStartY - e.changedTouches[0].clientY;
    touchStartY = null;
    if (Math.abs(dy) < 24) return;
    var target = dy > 0 ? panels[1] : panels[0];
    expand(target);
  }, {passive:true});
})();
