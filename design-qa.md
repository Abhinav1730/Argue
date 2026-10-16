# Relay design QA

Source visual truth: `docs/references/relay-selected.png` (the user's selected Relay attachment).
Implementation: http://127.0.0.1:3000/, explicitly labeled Demo, Asha/Mateo captions visible, both speaking.
Final implementation screenshot: `docs/qa/relay-desktop.jpg`.

## Evidence and normalization

- Reference: 1487 × 1058 pixels.
- Final desktop: 1487 × 1058 pixels, CSS viewport 1487 × 1058. Equal dimensions; no resampling or density normalization was needed.
- Full comparison: `docs/qa/compare-desktop.jpg`, reference left and implementation right in one 2974 × 1058 input.
- Caption region: `docs/qa/compare-caption.jpg`, matching source/render crops (480,230)–(1460,515), combined into one 1960 × 285 input. The display font differences are readable here rather than inferred from code.
- Narrow desktop: `docs/qa/relay-1024.jpg`, CSS viewport 1024 × 900. DOM scroll dimensions 1024 × 900; toolbar y=700–830 and footer y=830–900.
- Mobile: `docs/qa/relay-mobile.jpg`, CSS viewport 320 × 800; captured content 304 × 1145 pixels excludes the native scrollbar. Vertical scrolling is intentional. No horizontal overflow; names, source scripts, translations, controls and footer remain readable.
- Functional browser screenshots: `docs/qa/live-source-delivery.jpg` and `docs/qa/third-participant-rejected.jpg`.

All comparison images were opened and visually inspected together, not judged from file paths alone.

Additional compact-height styles apply only to desktop windows at most 850 pixels tall, keeping controls in view and allowing long card/stage content to scroll. Their production build passed. A final optional 1280 × 720 capture was blocked by the browser's `ERR_NETWORK_IO_SUSPENDED` after computer sleep; it is not included as passed visual evidence. The three required reference/narrow/mobile captures above are unaffected by that desktop-height rule.

## Comparison history

1. **Initial desktop — blocked [P2].** The content region exceeded the reference viewport and moved the footer below the fold. Initial evidence: `docs/qa/relay-desktop-initial.jpg`, `docs/qa/compare-initial.jpg`. The overflow also introduced a 15-pixel scrollbar, so this initial screenshot was 1472 pixels wide; it was not presented as an exact density match.
   **Fix:** Give the desktop shell an explicit viewport height; constrain the participant grid; adjust display-caption scale and stage bottom spacing. Post-fix desktop measures 1487 × 1058 with scrollHeight 1058.
2. **Participant rhythm — blocked [P2].** Speaker source text sat too low relative to the waveform. The narrow layout let the Hindi transliteration extend beyond its card.
   **Fix:** Reduce participant waveform height/margins, then use smaller waveform and language-label dimensions in the 768–1200 breakpoint. Final narrow-card transcript bounds lie within their cards.
3. **Narrow toolbar — blocked [P2].** Natural toolbar content added roughly 18 pixels despite a smaller minimum height.
   **Fix:** Reduce vertical toolbar padding at the narrow breakpoint. Final 1024 × 900 view fits completely; no persistent control or footer is clipped.
4. **Mobile header rhythm — blocked [P2].** The wordmark and room controls were cramped at 320 pixels.
   **Fix:** At widths below 380 pixels, use a 34-pixel wordmark, 16-pixel header inset and 12-pixel gaps. The final mobile screenshot shows the complete header and controls.
5. **Final comparison — passed.** Reopened final combined full-view and caption-region evidence, plus mobile and narrow desktop captures, after the above fixes.

## Required fidelity surfaces

| Surface | Result |
| --- | --- |
| Fonts / typography | Anton display captions, Inter Tight wordmark/names, IBM Plex Mono labels loaded. Cream/lime hierarchy and two-clause caption are preserved. Hindi uses available script fallback. The generated reference's exact font geometry is not identified; the approved free-font substitution is an accepted P3 difference. |
| Spacing / layout | 121-pixel header, approximately 461-pixel speaker rail, 678-pixel main region, 165-pixel desktop toolbar and 94-pixel footer match the composition. Narrow and mobile layouts are deliberate responsive adaptations. |
| Colors / tokens | Graphite surfaces, warm-white text, acid-lime #c6fa46, thin muted borders, and red leave control preserve the target hierarchy and contrast. |
| Images / assets | No photographic or illustrated assets are required. Phosphor icons provide controls and status marks. Canvas waveforms represent changing signal rather than approximated illustrations. The source's subtle grain is omitted; solid surfaces are accepted P3 polish. |
| Copy / content | Selected Hindi, transliteration, Spanish source and English translation are retained. Added Demo, Start a room and Room settings expose actual functionality. Relay replaces the mock's inconsistent Signal footer according to the approved spec. Actual time replaces the mock's fixed time. |

## Interactions and accessibility

Browser-verified: demo mic toggle, caption hide/show, replay feedback, room setup and language selection, processing consent, two actual browser participants joining one room, Spanish typed source delivery, third participant rejection, leave/ended view, and return to Demo. Native dialogs trap focus and support Escape; controls have accessible names and visible focus styling.

Reduced-motion emulation was enabled and confirmed through the browser, then cleared. Canvas animation and CSS transitions honor the preference. The final fresh preview's console reported no warnings/errors.

The temporary synthetic microphone injection method is unsupported by the browser tool. No real microphone permission was granted. WebSocket signaling and media-controller behaviors are tested independently; actual peer audio, speech recognition accuracy, acoustic echo, bilingual fidelity and Internet latency are not certified by this visual QA.

## Findings

No actionable P0/P1/P2 visual findings remain.

## Follow-up polish

- [P3] Exact glyph widths and the Spanish quote's line wrapping can differ from the generated mock while using the approved font families.
- [P3] The generated reference's grain and precise decorative waveform shape are not duplicated; actual amplitudes and motion vary by frame.

## Implementation checklist

- [x] Full and focused source/render comparisons opened.
- [x] Desktop overflow, participant rhythm and narrow clipping fixed.
- [x] Desktop, narrow desktop, mobile and reduced motion inspected.
- [x] Main local controls and two-person room journey exercised.
- [x] Browser errors checked; external provider and real-speech limits reported separately.

final result: passed

