// "See the menu" (or anything else) can open the Services menu: the dropdown on
// wide screens, the menu drawer on phones. The nav listens for this event.
export const OPEN_SERVICES = 'wr:open-services';
export const openServicesMenu = () => window.dispatchEvent(new Event(OPEN_SERVICES));
