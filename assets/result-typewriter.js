(function () {
    var page = document.querySelector('.page-result');
    if (!page) {
        return;
    }

    var storySection = page.querySelector('.story[data-typewriter="on"]');
    if (!storySection) {
        return;
    }
    var banner = page.querySelector('.result-mob-banner');
    var introList = page.querySelector('[data-intro-list]');
    var introShowMore = page.querySelector('[data-intro-show-more]');
    var introFacts = page.querySelector('[data-intro-facts]');
    var introFooter = null;
    var introSkipWrap = page.querySelector('[data-intro-skip-wrap]');
    var introSkipButton = page.querySelector('[data-intro-skip]');
    var mobSequenceBanner = page.querySelector('[data-mob-sequence]');
    var mobLayerBase = page.querySelector('.result-mob-layer-base');
    var mobLayerTop = page.querySelector('[data-mob-layer-top]');

    var lines = Array.prototype.slice.call(storySection.querySelectorAll('.story-line'));
    if (lines.length === 0) {
        return;
    }

    var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

    function applySpeedScaledMobTransitions() {
        var baseDurationMs = scaleMs(650);
        var topDurationMs = scaleMs(2600);

        if (mobLayerBase) {
            mobLayerBase.style.transitionDuration = baseDurationMs + 'ms';
        }
        if (mobLayerTop) {
            mobLayerTop.style.transitionDuration = topDurationMs + 'ms';
        }
    }

    function lineChars(text) {
        return Array.from(text);
    }

    function punctuationPauseMs(chars, charIndex) {
        var char = chars[charIndex];
        var nextChar = charIndex + 1 < chars.length ? chars[charIndex + 1] : '';
        var isBoundary = nextChar === '' || /\s/.test(nextChar);
        if (!isBoundary) {
            return 0;
        }

        if (char === '.' || char === '。' || char === '!' || char === '！' || char === '?') {
            return 300;
        }
        if (char === ':' || char === ';') {
            return 180;
        }
        if (char === ',') {
            return 90;
        }
        return 0;
    }

    var storyTrack = document.createElement('div');
    storyTrack.className = 'story-type-track';
    var scrollingNodes = Array.prototype.slice.call(storySection.querySelectorAll('.story-gap-line, .story-line'));
    if (scrollingNodes.length > 0) {
        storySection.insertBefore(storyTrack, scrollingNodes[0]);
        for (var moveIndex = 0; moveIndex < scrollingNodes.length; moveIndex++) {
            storyTrack.appendChild(scrollingNodes[moveIndex]);
        }
    }

    var lineEntries = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var storedText = line.getAttribute('data-story-text');
        var sourceText = storedText !== null ? storedText : (line.textContent || '');
        var text = sourceText.replace(/\s+/g, ' ').trim();
        if (text === '') {
            line.style.display = 'none';
            continue;
        }
        lineEntries.push({ line: line, text: text });
    }

    function revealDeferredSections() {
        if (introList) {
            introList.classList.remove('intro-hidden');
        }
        if (introShowMore) {
            introShowMore.classList.remove('intro-hidden');
        }
        if (introFacts) {
            introFacts.classList.remove('intro-hidden');
        }
        if (!introFooter) {
            introFooter = page.querySelector('[data-intro-footer]');
        }
        if (introFooter) {
            introFooter.classList.remove('intro-hidden');
            introFooter.style.display = '';
        }
    }

    function hideSkipControl() {
        if (introSkipWrap) {
            introSkipWrap.style.display = 'none';
        }
    }

    function scrollToListStart() {
        if (introList && typeof introList.scrollIntoView === 'function') {
            introList.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }

    function lockStoryHeightToLine(line) {
        if (!line) {
            return;
        }
        var storyRect = storySection.getBoundingClientRect();
        var lineRect = line.getBoundingClientRect();
        var targetHeight = Math.max(0, (lineRect.bottom - storyRect.top) + 8);
        storySection.style.height = targetHeight.toFixed(2) + 'px';
    }

    if (lineEntries.length === 0) {
        revealDeferredSections();
        hideSkipControl();
        return;
    }

    if (prefersReducedMotion) {
        for (var staticIndex = 0; staticIndex < lineEntries.length; staticIndex++) {
            lineEntries[staticIndex].line.textContent = lineEntries[staticIndex].text;
        }
        lockStoryHeightToLine(lineEntries[lineEntries.length - 1].line);
        revealDeferredSections();
        hideSkipControl();
        return;
    }

    var scheduledTimeouts = [];
    var stopped = false;
    var animationFrameId = 0;
    var lastFrameAt = 0;
    var scrollOffset = 0;
    var baseScrollPxPerSec = 10.5 * introSpeedMultiplier;
    var activeCursorLine = null;
    var pendingNextLineIndex = null;
    var earliestNextTypingAt = 0;
    var pendingFinalReveal = false;
    var revealListDelayMs = 1000;
    var defaultLinePauseMs = 1000;
    var mobLayerPreRevealDelayMs = 1400;
    var mobLayerPostRevealDelayMs = 6200;
    var root = document.documentElement;
    var body = document.body;
    var prevRootOverflowY = root.style.overflowY;
    var prevBodyOverflowY = body.style.overflowY;
    var isPageScrollLocked = false;
    var isDocumentHidden = document.hidden === true;
    var hiddenAtMs = isDocumentHidden ? performance.now() : 0;
    var hasMobLayer2Shown = false;
    var mobLayerRevealLineIndex = Math.max(0, lineEntries.length - 2);

    function viewportHeightPx() {
        return window.innerHeight || document.documentElement.clientHeight || 800;
    }

    function resetViewportToTop() {
        if (window.history && 'scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }

    function lockPageScroll() {
        if (isPageScrollLocked) {
            return;
        }
        isPageScrollLocked = true;
        root.style.overflowY = 'hidden';
        body.style.overflowY = 'hidden';
    }

    function unlockPageScroll() {
        if (!isPageScrollLocked) {
            return;
        }
        isPageScrollLocked = false;
        root.style.overflowY = prevRootOverflowY;
        body.style.overflowY = prevBodyOverflowY;
    }

    function schedule(callback, delayMs) {
        var timeoutId = window.setTimeout(function () {
            if (stopped) {
                return;
            }
            if (isDocumentHidden || document.hidden) {
                schedule(callback, 120);
                return;
            }
            callback();
        }, scaleMs(delayMs));
        scheduledTimeouts.push(timeoutId);
    }

    function clearScheduledTimeoutsOnly() {
        for (var timeoutIndex = 0; timeoutIndex < scheduledTimeouts.length; timeoutIndex++) {
            window.clearTimeout(scheduledTimeouts[timeoutIndex]);
        }
        scheduledTimeouts = [];
    }

    function clearTimeouts(shouldUnlockScroll) {
        stopped = true;
        clearScheduledTimeoutsOnly();
        stopScrollTicker();
        if (shouldUnlockScroll === true) {
            unlockPageScroll();
        }
    }

    function stopScrollTicker() {
        if (animationFrameId !== 0) {
            window.cancelAnimationFrame(animationFrameId);
            animationFrameId = 0;
        }
    }

    function finishIntroAndReveal(scrollToList) {
        if (stopped) {
            revealDeferredSections();
            unlockPageScroll();
            scrollToListStart();
            return;
        }

        clearScheduledTimeoutsOnly();
        stopScrollTicker();
        pendingFinalReveal = false;

        if (scrollToList) {
            if (mobSequenceBanner) {
                mobSequenceBanner.classList.add('is-layer-2-visible');
            }
            if (storyTrack) {
                storyTrack.style.transform = 'translate3d(0, ' + (-scrollOffset).toFixed(2) + 'px, 0)';
            }
            for (var completeIndex = 0; completeIndex < lineEntries.length; completeIndex++) {
                var completeEntry = lineEntries[completeIndex];
                completeEntry.line.textContent = completeEntry.text;
                completeEntry.line.style.display = 'block';
            }
            pendingNextLineIndex = null;
            earliestNextTypingAt = 0;
            introStarted = true;
            activeCursorLine = lineEntries[lineEntries.length - 1].line;
            storySection.style.height = '';
            revealDeferredSections();
        }

        for (var cleanupIndex = 0; cleanupIndex < lineEntries.length; cleanupIndex++) {
            lineEntries[cleanupIndex].line.classList.remove('is-typing');
            lineEntries[cleanupIndex].line.classList.remove('is-waiting');
        }

        if (scrollToList) {
            alignActiveLineToTargetDistance();
        }
        enforceStoryFadeMask();
        lockStoryHeightToLine(activeCursorLine || lineEntries[0].line);
        hideSkipControl();
        function revealOnceVisible() {
            if (isDocumentHidden || document.hidden) {
                var retryId = window.setTimeout(revealOnceVisible, scaleMs(120));
                scheduledTimeouts.push(retryId);
                return;
            }
            revealDeferredSections();
            unlockPageScroll();
            scrollToListStart();
        }
        var revealDelayMs = scrollToList ? 0 : revealListDelayMs;
        var revealTimeoutId = window.setTimeout(revealOnceVisible, scaleMs(revealDelayMs));
        scheduledTimeouts.push(revealTimeoutId);
    }

    function handleVisibilityChange() {
        if (stopped) {
            return;
        }

        if (document.hidden) {
            isDocumentHidden = true;
            hiddenAtMs = performance.now();
            stopScrollTicker();
            return;
        }

        if (isDocumentHidden) {
            var nowMs = performance.now();
            var hiddenDurationMs = hiddenAtMs > 0 ? nowMs - hiddenAtMs : 0;
            if (pendingNextLineIndex !== null && earliestNextTypingAt > 0 && hiddenDurationMs > 0) {
                earliestNextTypingAt += hiddenDurationMs;
            }
            hiddenAtMs = 0;
            isDocumentHidden = false;
        }

        startScrollTicker();
    }

    function cursorDistanceFromBannerPx() {
        if (!banner || !activeCursorLine) {
            return Number.POSITIVE_INFINITY;
        }
        if (!document.body.contains(activeCursorLine)) {
            return Number.POSITIVE_INFINITY;
        }

        var bannerRect = banner.getBoundingClientRect();
        var lineRect = activeCursorLine.getBoundingClientRect();
        var cursorY = lineRect.top + (lineRect.height * 0.78);
        return cursorY - bannerRect.bottom;
    }

    function alignActiveLineToTargetDistance() {
        if (!storyTrack || !banner || !activeCursorLine) {
            return;
        }

        var currentDistancePx = cursorDistanceFromBannerPx();
        if (!Number.isFinite(currentDistancePx)) {
            return;
        }

        var targetDistancePx = viewportHeightPx() * 0.15;
        var requiredShiftPx = currentDistancePx - targetDistancePx;
        if (!Number.isFinite(requiredShiftPx) || requiredShiftPx <= 0) {
            return;
        }

        scrollOffset = Math.max(0, scrollOffset + requiredShiftPx);
        storyTrack.style.transform = 'translate3d(0, ' + (-scrollOffset).toFixed(2) + 'px, 0)';
    }

    function enforceStoryFadeMask() {
        var maskGradient = 'linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0.14) 16px, rgba(0,0,0,0.48) 38px, rgba(0,0,0,0.84) 68px, rgba(0,0,0,1) 92px, rgba(0,0,0,1) 100%)';
        storySection.style.overflow = 'hidden';
        storySection.style.webkitMaskImage = maskGradient;
        storySection.style.maskImage = maskGradient;
    }

    function adaptiveScrollSpeedFactor() {
        var distancePx = cursorDistanceFromBannerPx();
        if (!Number.isFinite(distancePx)) {
            return 1;
        }

        var bandMinPx = viewportHeightPx() * 0.1;
        var bandMaxPx = viewportHeightPx() * 0.2;
        // var minFactor = 0.03;
        // var maxFactor = 6.2;

        // function clamp01(value) {
        //     if (value < 0) {
        //         return 0;
        //     }
        //     if (value > 1) {
        //         return 1;
        //     }
        //     return value;
        // }

        // if (distancePx >= bandMinPx && distancePx <= bandMaxPx) {
        //     return 1;
        // }

        // if (distancePx < bandMinPx) {
        //     var nearErrorPx = bandMinPx - distancePx;
        //     var nearRangePx = Math.max(1, viewportHeightPx() * 0.18);
        //     var nearRatio = clamp01(nearErrorPx / nearRangePx);
        //     var nearCurve = Math.pow(nearRatio, 0.45);
        //     var factor = Math.max(minFactor, 1 - ((1 - minFactor) * nearCurve));

        //     // Extra braking once cursor enters top fade zone near the banner.
        //     var fadeZoneStartPx = bandMinPx * 0.9;
        //     if (distancePx <= fadeZoneStartPx) {
        //         var fadeRatio = clamp01(Math.max(0, distancePx) / Math.max(1, fadeZoneStartPx));
        //         var fadeBrake = 0.22 + (0.78 * Math.pow(fadeRatio, 1.7));
        //         factor *= fadeBrake;
        //     }

        //     return Math.max(0.01, factor * factor);
        // }

        const limit = (bandMinPx + bandMaxPx) / 2;

        if (distancePx < limit) {
            var farErrorPx = distancePx - limit;
            var farRatio = farErrorPx / limit;
            var result = 1 + farRatio;
            if (result < 0) {
                return 0.01;
            }
            console.log(result);
            return Math.pow(result, 3);
        }

        if (distancePx > limit) {
            var farErrorPx = distancePx - limit;
            var farRatio = farErrorPx / limit;
            var result = 1 + farRatio;
            if (result < 0) {
                return 0.01;
            }
            console.log(result);
            return result;
        }
        return 1;
    }

    function limitAdvanceToKeepActiveLineVisible(desiredAdvancePx) {
        if (!Number.isFinite(desiredAdvancePx) || desiredAdvancePx <= 0) {
            return 0;
        }

        var distancePx = cursorDistanceFromBannerPx();
        if (!Number.isFinite(distancePx)) {
            return desiredAdvancePx;
        }

        // Keep the active line below the fade start near the banner.
        var guardDistancePx = viewportHeightPx() * 0.105;
        var allowedAdvancePx = distancePx - guardDistancePx;
        if (!Number.isFinite(allowedAdvancePx) || allowedAdvancePx <= 0) {
            return 0;
        }

        return Math.min(desiredAdvancePx, allowedAdvancePx);
    }

    function tryStartPendingLine() {
        if (pendingNextLineIndex === null) {
            return;
        }
        if (performance.now() < earliestNextTypingAt) {
            return;
        }

        var nextLineIndex = pendingNextLineIndex;
        pendingNextLineIndex = null;
        earliestNextTypingAt = 0;

        if (nextLineIndex > 0 && nextLineIndex - 1 < lineEntries.length) {
            lineEntries[nextLineIndex - 1].line.classList.remove('is-waiting');
        }

        typeLineAt(nextLineIndex);
    }

    function tick(nowMs) {
        if (stopped || !storyTrack) {
            return;
        }

        if (lastFrameAt === 0) {
            lastFrameAt = nowMs;
        }

        var deltaSec = Math.max(0, (nowMs - lastFrameAt) / 1000);
        lastFrameAt = nowMs;
        var desiredAdvancePx = (baseScrollPxPerSec * adaptiveScrollSpeedFactor()) * deltaSec;
        var appliedAdvancePx = desiredAdvancePx; // limitAdvanceToKeepActiveLineVisible(desiredAdvancePx);
        scrollOffset += appliedAdvancePx;
        storyTrack.style.transform = 'translate3d(0, ' + (-scrollOffset).toFixed(2) + 'px, 0)';
        tryStartPendingLine();
        animationFrameId = window.requestAnimationFrame(tick);
    }

    function startScrollTicker() {
        if (animationFrameId !== 0 || !storyTrack) {
            return;
        }
        lastFrameAt = performance.now();
        animationFrameId = window.requestAnimationFrame(tick);
    }

    function showMobLayer2() {
        if (hasMobLayer2Shown) {
            return;
        }
        hasMobLayer2Shown = true;
        if (mobSequenceBanner) {
            mobSequenceBanner.classList.add('is-layer-2-visible');
        }
    }

    var introStarted = false;

    function beginIntroTyping() {
        if (stopped || introStarted) {
            return;
        }
        introStarted = true;
        if (!isDocumentHidden) {
            startScrollTicker();
        }
        typeLineAt(0);
    }

    function typeLine(line, text, onDone) {
        var chars = lineChars(text);
        var index = 0;
        var rendered = '';
        var baseTypeDelayMs = 38;

        line.textContent = '';
        line.classList.remove('is-waiting');
        line.classList.add('is-typing');

        if (chars.length === 0) {
            line.classList.remove('is-typing');
            onDone();
            return;
        }

        function step() {
            rendered += chars[index];
            line.textContent = rendered;
            index += 1;

            if (index >= chars.length) {
                line.classList.remove('is-typing');
                onDone();
                return;
            }

            var nextDelay = baseTypeDelayMs + punctuationPauseMs(chars, index - 1);
            schedule(step, nextDelay);
        }

        schedule(step, baseTypeDelayMs);
    }

    function typeLineAt(lineIndex) {
        if (lineIndex >= lineEntries.length) {
            var lastLine = lineEntries[lineEntries.length - 1];
            if (lastLine) {
                lastLine.line.classList.remove('is-waiting');
            }
            stopScrollTicker();
            return;
        }

        var entry = lineEntries[lineIndex];
        activeCursorLine = entry.line;
        typeLine(entry.line, entry.text, function () {
            activeCursorLine = entry.line;
            if (lineIndex + 1 >= lineEntries.length) {
                entry.line.classList.add('is-waiting');
                pendingFinalReveal = true;
                stopScrollTicker();
                schedule(function () {
                    if (!pendingFinalReveal || stopped) {
                        return;
                    }
                    pendingFinalReveal = false;
                    entry.line.classList.remove('is-waiting');
                    finishIntroAndReveal(false);
                }, 1000);
                return;
            }

            var nextLinePauseMs = defaultLinePauseMs;
            if (lineIndex === mobLayerRevealLineIndex) {
                schedule(function () {
                    showMobLayer2();
                }, mobLayerPreRevealDelayMs);
                nextLinePauseMs = mobLayerPreRevealDelayMs + mobLayerPostRevealDelayMs;
            }

            entry.line.classList.add('is-waiting');
            pendingNextLineIndex = lineIndex + 1;
            earliestNextTypingAt = performance.now() + scaleMs(nextLinePauseMs);
        });
    }

    for (var prepIndex = 0; prepIndex < lineEntries.length; prepIndex++) {
        lineEntries[prepIndex].line.textContent = '';
        lineEntries[prepIndex].line.classList.remove('is-typing');
        lineEntries[prepIndex].line.classList.remove('is-waiting');
    }

    if (introSkipButton) {
        introSkipButton.addEventListener('click', function () {
            finishIntroAndReveal(true);
        });
    }

    window.addEventListener('beforeunload', function () {
        clearTimeouts(true);
    }, { once: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    resetViewportToTop();
    lockPageScroll();
    applySpeedScaledMobTransitions();
    enforceStoryFadeMask();
    if (mobSequenceBanner) {
        mobSequenceBanner.classList.remove('is-layer-2-visible');
    }
    beginIntroTyping();
})();
