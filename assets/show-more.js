(function () {
    var cards = Array.prototype.slice.call(document.querySelectorAll('[data-person-card]'));
    var button = document.getElementById('show-more');
    if (!button || cards.length === 0) {
        return;
    }

    var visibleCount = 20;
    var step = 5;

    function applyVisibility() {
        for (var i = 0; i < cards.length; i++) {
            if (i < visibleCount) {
                cards[i].classList.remove('person-hidden');
            } else {
                cards[i].classList.add('person-hidden');
            }
        }

        if (visibleCount >= cards.length) {
            button.style.display = 'none';
        }
    }

    button.addEventListener('click', function () {
        visibleCount = Math.min(cards.length, visibleCount + step);
        applyVisibility();
    });

    applyVisibility();
})();

