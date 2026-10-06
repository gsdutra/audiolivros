// One stroke family (24px grid, 2px round strokes), drawn for this app.
const svg = (body, { fill = 'none', size = 24, label } = {}) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill}" stroke="currentColor" stroke-width="2" ` +
  `stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${body}</svg>`;

export const icon = {
  play: (s) => svg('<path d="M8 5.5v13a.6.6 0 0 0 .9.5l10.2-6.5a.6.6 0 0 0 0-1L8.9 5a.6.6 0 0 0-.9.5z" fill="currentColor"/>', { size: s }),
  pause: (s) => svg('<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/>', { size: s }),
  back: (n, s) => svg(`<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><text x="12.6" y="15.6" text-anchor="middle" font-size="8" font-weight="700" stroke="none" fill="currentColor" font-family="Barlow Condensed, sans-serif">${n}</text>`, { size: s }),
  fwd: (n, s) => svg(`<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/><text x="11.4" y="15.6" text-anchor="middle" font-size="8" font-weight="700" stroke="none" fill="currentColor" font-family="Barlow Condensed, sans-serif">${n}</text>`, { size: s }),
  prevStation: (s) => svg('<path d="M6 5v14"/><path d="M18 6.2v11.6a.5.5 0 0 1-.8.4L9.6 12.4a.5.5 0 0 1 0-.8l7.6-5.8a.5.5 0 0 1 .8.4z" fill="currentColor"/>', { size: s }),
  nextStation: (s) => svg('<path d="M18 5v14"/><path d="M6 6.2v11.6a.5.5 0 0 0 .8.4l7.6-5.8a.5.5 0 0 0 0-.8L6.8 5.8a.5.5 0 0 0-.8.4z" fill="currentColor"/>', { size: s }),
  moon: (s) => svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>', { size: s }),
  mark: (s) => svg('<path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4-6 4v-16a1 1 0 0 1 1-1z"/>', { size: s }),
  markAdd: (s) => svg('<path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4-6 4v-16a1 1 0 0 1 1-1z"/><path d="M12 7.5v6M9 10.5h6"/>', { size: s }),
  listening: (s) => svg('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4" height="6.5" rx="1.5"/>', { size: s }),
  line: (s) => svg('<path d="M8 3v18"/><circle cx="8" cy="6" r="2.2" fill="var(--ground)"/><circle cx="8" cy="12" r="2.2" fill="var(--ground)"/><circle cx="8" cy="18" r="2.2" fill="var(--ground)"/><path d="M13 6h7M13 12h7M13 18h5"/>', { size: s }),
  text: (s) => svg('<path d="M4 6h16M4 10.5h16M4 15h16M4 19.5h10"/>', { size: s }),
  chevronLeft: (s) => svg('<path d="M15 5l-7 7 7 7"/>', { size: s }),
  chevronDown: (s) => svg('<path d="M6 9l6 6 6-6"/>', { size: s }),
  arrowRight: (s) => svg('<path d="M4 12h15M13 6l6 6-6 6"/>', { size: s }),
  check: (s) => svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', { size: s }),
  download: (s) => svg('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>', { size: s }),
  trash: (s) => svg('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>', { size: s }),
  close: (s) => svg('<path d="M6 6l12 12M18 6L6 18"/>', { size: s }),
  lock: (s) => svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>', { size: s }),
};
