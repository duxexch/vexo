export function useGuidedFocus() {
    const focusAndScroll = (element: HTMLElement | null) => {
        if (!element) return;
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.focus({ preventScroll: true });
    };

    const queueFocus = (element: HTMLElement | null, delayMs: number = 120) => {
        if (!element) return;
        window.setTimeout(() => focusAndScroll(element), delayMs);
    };

    const focusFirstInteractiveIn = (container: HTMLElement | null) => {
        if (!container) return;
        const first = container.querySelector<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        focusAndScroll(first || container);
    };

    return {
        focusAndScroll,
        queueFocus,
        focusFirstInteractiveIn,
    };
}
