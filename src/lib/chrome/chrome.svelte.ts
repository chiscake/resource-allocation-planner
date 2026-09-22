const NAV_KEY = 'rap.navCollapsed';
/** Matches Tailwind `md` (768px). Mobile nav below this. */
export const CHROME_MD = 768;

export const chrome = $state({
	navCollapsed: false,
	mobileNavOpen: false,
	isMobile: false,
	notificationsOpen: false,
	unread: 0
});

let mqCleanup: (() => void) | null = null;

export function isMobileViewport(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia(`(max-width: ${CHROME_MD - 1}px)`).matches;
}

export function initChromeNav() {
	if (typeof window === 'undefined') return;

	if (typeof localStorage !== 'undefined') {
		chrome.navCollapsed = localStorage.getItem(NAV_KEY) === '1';
	}

	mqCleanup?.();
	const mq = window.matchMedia(`(max-width: ${CHROME_MD - 1}px)`);
	const sync = () => {
		chrome.isMobile = mq.matches;
		if (!mq.matches) chrome.mobileNavOpen = false;
	};
	sync();
	mq.addEventListener('change', sync);
	mqCleanup = () => mq.removeEventListener('change', sync);
}

export function toggleNav() {
	if (chrome.isMobile || isMobileViewport()) {
		chrome.mobileNavOpen = !chrome.mobileNavOpen;
		return;
	}
	chrome.navCollapsed = !chrome.navCollapsed;
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(NAV_KEY, chrome.navCollapsed ? '1' : '0');
	}
}

export function closeMobileNav() {
	chrome.mobileNavOpen = false;
}

export function openNotifications() {
	chrome.notificationsOpen = true;
}

export function closeNotifications() {
	chrome.notificationsOpen = false;
}

export function setUnread(count: number) {
	chrome.unread = count;
}
