(function () {
    var page = document.querySelector('.page-result');
    if (!page) {
        return;
    }

    function parseSpeedMultiplier(rawValue) {
        if (typeof rawValue !== 'string') {
            return 1;
        }
        var parsed = parseFloat(rawValue.trim());
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return 1;
        }
        return Math.min(100, parsed);
    }

    var introSpeedMultiplier = parseSpeedMultiplier(page.getAttribute('data-intro-speed'));

    function scaleMs(ms) {
        if (!Number.isFinite(ms)) {
            return 0;
        }
        return Math.max(0, Math.round(ms / introSpeedMultiplier));
    }

    var banner = page.querySelector('.result-mob-banner');
    var list = page.querySelector('#people-list');
    if (!banner || !list) {
        return;
    }

    if (window.history && 'scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    var root = document.documentElement;
    var body = document.body;
    var prevRootOverflowY = root.style.overflowY;
    var prevBodyOverflowY = body.style.overflowY;
    var isScrollLocked = false;

    function lockPageScroll() {
        if (isScrollLocked) {
            return;
        }
        isScrollLocked = true;
        root.style.overflowY = 'hidden';
        body.style.overflowY = 'hidden';
    }

    function unlockPageScroll() {
        if (!isScrollLocked) {
            return;
        }
        isScrollLocked = false;
        root.style.overflowY = prevRootOverflowY;
        body.style.overflowY = prevBodyOverflowY;
    }

    lockPageScroll();

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        unlockPageScroll();
        return;
    }

    if (document.readyState !== 'complete') {
        window.addEventListener('load', startSequence, { once: true });
        return;
    }

    startSequence();

    function startSequence() {
        var allLines = Array.prototype.slice.call(page.querySelectorAll('.story-line'));
        var showMoreWrap = page.querySelector('.show-more-wrap');
        var storySection = page.querySelector('.story');
        var listTitle = page.querySelector('.people-list-title');
        var skipEntryLink = page.querySelector('[data-skip-entry]');
        var skipEntryWrap = skipEntryLink ? skipEntryLink.parentElement : null;
        var storyTrack = null;
        var lines = [];
        var storyTexts = [];
        var scheduledTimeouts = [];
        var animationFrameId = 0;
        var sequenceFinished = false;
        var widthMeasurer = null;
        var scrollOffsetY = 0;
        var lastFrameAt = 0;
        var nextLineIndex = 0;
        var allowNextTypingAt = 0;
        var finalRevealAt = 0;
        var typingInProgress = false;
        var typingTriggerY = 0;
        var baseScrollPxPerSec = 14;
        var scrollPxPerSec = baseScrollPxPerSec * introSpeedMultiplier;

        function clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function setHiddenState(element, offsetY) {
            element.style.opacity = '0';
            element.style.transform = 'translateY(' + offsetY + 'px)';
        }

        function reveal(element, durationMs, easing) {
            var scaledDurationMs = scaleMs(durationMs);
            element.style.transition = 'opacity ' + scaledDurationMs + 'ms ' + easing + ', transform ' + scaledDurationMs + 'ms ' + easing;
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        }

        function schedule(callback, delayMs) {
            var timeoutId = window.setTimeout(function () {
                if (sequenceFinished) {
                    return;
                }
                callback();
            }, scaleMs(delayMs));
            scheduledTimeouts.push(timeoutId);
            return timeoutId;
        }

        function clearScheduledTimeouts() {
            for (var timeoutIndex = 0; timeoutIndex < scheduledTimeouts.length; timeoutIndex++) {
                window.clearTimeout(scheduledTimeouts[timeoutIndex]);
            }
            scheduledTimeouts = [];
        }

        function stopTicker() {
            if (animationFrameId !== 0) {
                window.cancelAnimationFrame(animationFrameId);
                animationFrameId = 0;
            }
        }

        function hideSkipLink() {
            if (!skipEntryWrap) {
                return;
            }
            skipEntryWrap.style.display = 'none';
        }

        function extractLineText(line) {
            var stored = line.getAttribute('data-story-text');
            if (stored !== null) {
                return stored;
            }

            var text = (line.textContent || '').replace(/\s+/g, ' ').trim();
            line.setAttribute('data-story-text', text);
            return text;
        }

        function lineChars(text) {
            return Array.from(text);
        }

        function getWidthMeasurer(line) {
            if (widthMeasurer !== null) {
                return widthMeasurer;
            }

            widthMeasurer = document.createElement('span');
            widthMeasurer.style.position = 'absolute';
            widthMeasurer.style.left = '-99999px';
            widthMeasurer.style.top = '-99999px';
            widthMeasurer.style.visibility = 'hidden';
            widthMeasurer.style.pointerEvents = 'none';
            widthMeasurer.style.whiteSpace = 'pre';

            var computed = window.getComputedStyle(line);
            widthMeasurer.style.font = computed.font;
            widthMeasurer.style.letterSpacing = computed.letterSpacing;
            widthMeasurer.style.textTransform = computed.textTransform;

            document.body.appendChild(widthMeasurer);
            return widthMeasurer;
        }

        function measureLineWidthPx(line, text) {
            var measurer = getWidthMeasurer(line);
            measurer.textContent = text === '' ? ' ' : text;
            var measured = Math.ceil(measurer.getBoundingClientRect().width);
            return Math.max(1, measured);
        }

        function getMaxFrameWidthPx(line) {
            var parentWidth = 0;
            if (line.parentElement && typeof line.parentElement.getBoundingClientRect === 'function') {
                parentWidth = line.parentElement.getBoundingClientRect().width;
            }
            if (!parentWidth || parentWidth <= 0) {
                parentWidth = window.innerWidth || document.documentElement.clientWidth || 320;
            }

            var computed = window.getComputedStyle(line);
            var cssMaxWidthRaw = computed.maxWidth || '';
            if (/px$/i.test(cssMaxWidthRaw)) {
                var cssMaxWidthPx = parseFloat(cssMaxWidthRaw);
                if (!isNaN(cssMaxWidthPx) && cssMaxWidthPx > 0) {
                    parentWidth = Math.min(parentWidth, cssMaxWidthPx);
                }
            }

            return Math.max(140, parentWidth - 6);
        }

        function applyFixedCenteredFrame(line, text) {
            var widthPx = measureLineWidthPx(line, text);
            var frameWidthPx = Math.min(widthPx, getMaxFrameWidthPx(line));
            line.style.width = frameWidthPx + 'px';
            line.style.maxWidth = '100%';
            line.style.marginLeft = 'auto';
            line.style.marginRight = 'auto';
            line.style.textAlign = 'left';
            line.style.whiteSpace = 'normal';
            line.style.overflowWrap = 'break-word';
            line.style.wordBreak = 'normal';
        }

        function lineHeightPx(line) {
            var height = Math.ceil(line.getBoundingClientRect().height);
            return Math.max(1, height);
        }

        function prepareLineForTyping(line, text) {
            line.setAttribute('data-story-text', text);
            applyFixedCenteredFrame(line, text);
            line.style.display = 'block';
            line.style.opacity = '1';
            line.style.transform = 'translateY(0)';
            line.textContent = text;
            line.style.minHeight = lineHeightPx(line) + 'px';
            line.textContent = '';
            line.classList.remove('is-typing');
            line.classList.remove('is-waiting');
        }

        function lineTypeMs(text) {
            var minTypeMs = 520;
            var msPerChar = 30;
            var chars = lineChars(text);
            var totalMs = chars.length * msPerChar;

            for (var i = 0; i < chars.length; i++) {
                totalMs += punctuationPauseMs(chars, i);
            }

            return Math.max(minTypeMs, totalMs);
        }

        function lineHoldMs(text) {
            var minHoldMs = 2400;
            var msPerChar = 36;
            return Math.max(minHoldMs, lineChars(text).length * msPerChar);
        }

        function punctuationPauseMs(chars, charIndex) {
            var char = chars[charIndex];
            var nextChar = charIndex + 1 < chars.length ? chars[charIndex + 1] : '';
            var isBoundary = nextChar === '' || /\s/.test(nextChar);
            if (!isBoundary) {
                return 0;
            }
            if (char === '.' || char === '。') {
                return 360;
            }
            if (char === ':') {
                return 240;
            }
            if (char === '!' || char === '！') {
                return 45;
            }
            return 0;
        }

        function typeLine(line, text, msPerChar, onDone) {
            var chars = lineChars(text);
            var index = 0;
            var rendered = '';

            line.textContent = '';
            line.classList.remove('is-waiting');
            line.classList.add('is-typing');

            if (chars.length === 0) {
                line.classList.remove('is-typing');
                if (typeof onDone === 'function') {
                    onDone();
                }
                return;
            }

            function step() {
                rendered += chars[index];
                line.textContent = rendered;
                index += 1;

                if (index >= chars.length) {
                    line.classList.remove('is-typing');
                    if (typeof onDone === 'function') {
                        onDone();
                    }
                    return;
                }

                var lastCharIndex = index - 1;
                var nextDelay = msPerChar + punctuationPauseMs(chars, lastCharIndex);
                schedule(step, nextDelay);
            }

            schedule(step, msPerChar);
        }

        function scrollToListStart() {
            if (typeof list.scrollIntoView !== 'function') {
                return;
            }
            list.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function clearLineIndicators() {
            for (var i = 0; i < lines.length; i++) {
                lines[i].classList.remove('is-waiting');
                lines[i].classList.remove('is-typing');
            }
        }

        function setListTitleVisible(isVisible) {
            if (!listTitle) {
                return;
            }
            if (isVisible) {
                listTitle.classList.add('is-visible');
                list.classList.add('has-title');
                return;
            }
            listTitle.classList.remove('is-visible');
            list.classList.remove('has-title');
        }

        function revealImmediately(element) {
            if (!element) {
                return;
            }
            element.style.transition = 'none';
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        }

        function finishSequence(shouldScrollToList, showListTitle, hideIntroBlock) {
            if (sequenceFinished) {
                return;
            }
            sequenceFinished = true;
            stopTicker();
            clearScheduledTimeouts();
            clearLineIndicators();
            hideSkipLink();
            setListTitleVisible(showListTitle === true);
            if (hideIntroBlock === true && storySection) {
                storySection.style.display = 'none';
            }
            revealImmediately(banner);
            revealImmediately(list);
            if (showMoreWrap) {
                revealImmediately(showMoreWrap);
            }
            unlockPageScroll();
            if (shouldScrollToList) {
                scrollToListStart();
            }
        }

        function revealListAfterIntro(delayMs) {
            schedule(function () {
                hideSkipLink();
                clearLineIndicators();
                setListTitleVisible(false);
                reveal(list, 780, 'ease-out');
                if (showMoreWrap) {
                    reveal(showMoreWrap, 780, 'ease-out');
                }
                unlockPageScroll();
                stopTicker();

                schedule(function () {
                    scrollToListStart();
                    sequenceFinished = true;
                }, 120);
            }, delayMs);
        }

        function lineCenterYInStory(line) {
            var top = line.offsetTop - scrollOffsetY;
            var height = lineHeightPx(line);
            return top + (height * 0.5);
        }

        function computeTypingTriggerY() {
            if (!storySection) {
                return 0;
            }
            var rect = storySection.getBoundingClientRect();
            var visibleCenterViewportY = window.innerHeight * 0.52;
            var centerInStory = visibleCenterViewportY - rect.top;
            var clampedCenterInStory = clamp(centerInStory, rect.height * 0.2, rect.height * 0.46);
            return Math.max(12, Math.min(rect.height - 18, clampedCenterInStory - 12));
        }

        function applyTrackTransform() {
            if (!storyTrack) {
                return;
            }
            storyTrack.style.transform = 'translate3d(0, ' + (-scrollOffsetY).toFixed(2) + 'px, 0)';
        }

        function maybeStartNextLine(nowMs) {
            if (typingInProgress || nextLineIndex >= lines.length || nowMs < allowNextTypingAt) {
                return;
            }

            var line = lines[nextLineIndex];
            var text = storyTexts[nextLineIndex];
            if (lineCenterYInStory(line) > typingTriggerY) {
                return;
            }

            clearLineIndicators();
            var typedIndex = nextLineIndex;
            nextLineIndex += 1;
            typingInProgress = true;
            typeLine(line, text, 30, function () {
                if (sequenceFinished) {
                    typingInProgress = false;
                    return;
                }

                if (typedIndex < lines.length - 1) {
                    line.classList.add('is-waiting');
                    typingInProgress = false;
                    allowNextTypingAt = performance.now() + scaleMs(lineHoldMs(text));
                    return;
                }

                typingInProgress = false;
                finalRevealAt = performance.now() + scaleMs(Math.max(1100, lineHoldMs(text) * 0.55));
            });
        }

        function tick(nowMs) {
            if (sequenceFinished) {
                return;
            }

            if (lastFrameAt === 0) {
                lastFrameAt = nowMs;
            }

            var deltaSec = Math.max(0, (nowMs - lastFrameAt) / 1000);
            lastFrameAt = nowMs;

            scrollOffsetY += scrollPxPerSec * deltaSec;
            applyTrackTransform();
            maybeStartNextLine(nowMs);

            if (finalRevealAt > 0 && nowMs >= finalRevealAt) {
                finalRevealAt = 0;
                revealListAfterIntro(80);
                return;
            }

            animationFrameId = window.requestAnimationFrame(tick);
        }

        setListTitleVisible(false);
        setHiddenState(banner, 10);
        setHiddenState(list, 16);
        if (showMoreWrap) {
            setHiddenState(showMoreWrap, 16);
        }

        if (skipEntryLink) {
            skipEntryLink.addEventListener('click', function (event) {
                event.preventDefault();
                finishSequence(true, true, true);
            });
        }

        if (!storySection || allLines.length === 0) {
            reveal(banner, 1200, 'cubic-bezier(0.22, 1, 0.36, 1)');
            revealListAfterIntro(900);
            return;
        }

        storyTrack = document.createElement('div');
        storyTrack.className = 'story-track';
        storySection.insertBefore(storyTrack, skipEntryWrap || null);
        for (var moveIndex = 0; moveIndex < allLines.length; moveIndex++) {
            storyTrack.appendChild(allLines[moveIndex]);
        }

        lines = Array.prototype.slice.call(storyTrack.querySelectorAll('.story-line'));
        for (var textIndex = 0; textIndex < lines.length; textIndex++) {
            var lineText = extractLineText(lines[textIndex]);
            if (lineText !== '') {
                storyTexts.push(lineText);
                continue;
            }
            lines[textIndex].remove();
        }
        lines = Array.prototype.slice.call(storyTrack.querySelectorAll('.story-line'));

        if (lines.length === 0) {
            reveal(banner, 1200, 'cubic-bezier(0.22, 1, 0.36, 1)');
            revealListAfterIntro(900);
            return;
        }

        for (var prepIndex = 0; prepIndex < lines.length; prepIndex++) {
            prepareLineForTyping(lines[prepIndex], storyTexts[prepIndex]);
        }

        typingTriggerY = computeTypingTriggerY();
        var firstLineCenter = lines[0].offsetTop + (lineHeightPx(lines[0]) * 0.5);
        scrollOffsetY = firstLineCenter - typingTriggerY;
        applyTrackTransform();

        window.addEventListener('resize', function () {
            typingTriggerY = computeTypingTriggerY();
        });

        // Force layout so transition starts from hidden state.
        void page.offsetWidth;

        reveal(banner, 1200, 'cubic-bezier(0.22, 1, 0.36, 1)');

        schedule(function () {
            lastFrameAt = performance.now();
            animationFrameId = window.requestAnimationFrame(tick);
        }, 220);
    }
})();
