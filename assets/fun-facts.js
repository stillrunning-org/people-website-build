(function () {
    var section = document.querySelector('[data-facts-section]');
    if (!section) {
        return;
    }

    var dataNode = section.querySelector('[data-facts-json]');
    var textNode = section.querySelector('[data-fact-text]');
    var refsNode = section.querySelector('[data-fact-refs]');
    var nextButton = section.querySelector('[data-fact-next]');
    if (!dataNode || !textNode || !refsNode) {
        return;
    }

    var facts = [];
    try {
        var parsed = JSON.parse(dataNode.textContent || '[]');
        if (Array.isArray(parsed)) {
            facts = parsed;
        }
    } catch (error) {
        facts = [];
    }

    if (facts.length === 0) {
        if (nextButton) {
            nextButton.style.display = 'none';
        }
        return;
    }

    var referencesLabel = (section.getAttribute('data-fact-references-label') || 'References').trim();
    var currentOrderPos = 0;
    var isSwitching = false;
    var switchFadeMs = 180;
    var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var factOrder = buildRandomOrder(facts.length);

    function buildRandomOrder(total) {
        var indexes = [];
        for (var i = 0; i < total; i++) {
            indexes.push(i);
        }

        for (var j = indexes.length - 1; j > 0; j--) {
            var swapIndex = Math.floor(Math.random() * (j + 1));
            var temp = indexes[j];
            indexes[j] = indexes[swapIndex];
            indexes[swapIndex] = temp;
        }

        return indexes;
    }

    function renderParagraphs(paragraphs) {
        textNode.innerHTML = '';
        if (!Array.isArray(paragraphs)) {
            return;
        }

        for (var i = 0; i < paragraphs.length; i++) {
            var paragraphText = (typeof paragraphs[i] === 'string') ? paragraphs[i].trim() : '';
            if (paragraphText === '') {
                continue;
            }
            var paragraph = document.createElement('p');
            paragraph.textContent = paragraphText;
            textNode.appendChild(paragraph);
        }
    }

    function renderReferences(references) {
        refsNode.innerHTML = '';

        var heading = document.createElement('strong');
        heading.textContent = referencesLabel + ':';
        refsNode.appendChild(heading);

        var list = document.createElement('ul');
        if (Array.isArray(references)) {
            for (var i = 0; i < references.length; i++) {
                var reference = references[i];
                if (!reference || typeof reference !== 'object') {
                    continue;
                }

                var url = (typeof reference.url === 'string') ? reference.url.trim() : '';
                var label = (typeof reference.label === 'string') ? reference.label.trim() : '';
                if (url === '' || label === '') {
                    continue;
                }

                var listItem = document.createElement('li');
                var link = document.createElement('a');
                link.href = url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = label;
                listItem.appendChild(link);
                list.appendChild(listItem);
            }
        }

        refsNode.appendChild(list);
    }

    function renderFact(orderPosition) {
        var factIndex = factOrder[orderPosition];
        var fact = facts[factIndex] || {};
        renderParagraphs(fact.paragraphs || []);
        renderReferences(fact.references || []);

        if (!nextButton) {
            return;
        }

        if (orderPosition >= factOrder.length - 1) {
            nextButton.style.display = 'none';
        } else {
            nextButton.style.display = '';
        }
    }

    if (nextButton) {
        nextButton.addEventListener('click', function () {
            if (isSwitching) {
                return;
            }
            if (currentOrderPos >= factOrder.length - 1) {
                nextButton.style.display = 'none';
                return;
            }

            var nextOrderPos = currentOrderPos + 1;
            if (prefersReducedMotion) {
                currentOrderPos = nextOrderPos;
                renderFact(currentOrderPos);
                return;
            }

            isSwitching = true;
            nextButton.disabled = true;
            section.classList.add('is-switching-fact');

            window.setTimeout(function () {
                currentOrderPos = nextOrderPos;
                renderFact(currentOrderPos);

                window.requestAnimationFrame(function () {
                    window.requestAnimationFrame(function () {
                        section.classList.remove('is-switching-fact');
                        window.setTimeout(function () {
                            isSwitching = false;
                            if (nextButton.style.display !== 'none') {
                                nextButton.disabled = false;
                            }
                        }, switchFadeMs);
                    });
                });
            }, switchFadeMs);
        });
    }

    renderFact(currentOrderPos);
})();
