(function () {
  const ICONS = {
    logo: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M4 3h16l-3 5H9v2.5h7l-2.2 3.5H9v2.5h8l3 4.5H4V3zm13.5 7.5L21 12l-3.5 1.5L16 17l-1.5-3.5L11 12l3.5-1.5L16 7l1.5 3.5z"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.5 4.4c0-1.1 1.2-1.8 2.1-1.2l11.6 7.6c.9.6.9 1.8 0 2.4L8.6 20.8c-.9.6-2.1-.1-2.1-1.2V4.4z"/></svg>`,
    levels: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 4h8v7H3V4zm10 0h8v7h-8V4zM3 13h8v7H3v-7zm10 0h8v7h-8v-7z"/></svg>`,
    shop: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 4h14l2 5v2H3V9l2-5zm0 9h14v7H5v-7zm4 2v3h6v-3H9z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.4 2h3.2l.5 2.4c.7.2 1.3.6 1.9 1l2.3-.8 1.6 2.8-1.8 1.6c.1.6.1 1.4 0 2l1.8 1.6-1.6 2.8-2.3-.8c-.6.4-1.2.8-1.9 1l-.5 2.4h-3.2l-.5-2.4c-.7-.2-1.3-.6-1.9-1l-2.3.8-1.6-2.8 1.8-1.6c-.1-.6-.1-1.4 0-2L4.1 7.4 5.7 4.6l2.3.8c.6-.4 1.2-.8 1.9-1L10.4 2zM12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"/></svg>`,
    achievements: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3h12v2h3v4c0 2.6-1.8 4.8-4.3 5.3A6 6 0 0113 16.9V19h4v2H7v-2h4v-2.1a6 6 0 01-3.7-2.6C4.8 13.8 3 11.6 3 9V5h3V3zm-1 4v2c0 1.4.8 2.6 2 3.1V7H5zm14 0h-2v5.1c1.2-.5 2-1.7 2-3.1V7z"/></svg>`,
    leaderboards: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 4h6v16H9V4zM3 10h5v10H3V10zm13 3h5v7h-5v-7z"/></svg>`,
    credits: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6L12 2zm6 13l1.1 2.9L22 19l-2.9 1.1L18 23l-1.1-2.9L14 19l2.9-1.1L18 15z"/></svg>`,
    back: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.7 5.3L5 12l6.7 6.7 1.4-1.4L8.8 13H19v-2H8.8l4.3-4.3-1.4-1.4z"/></svg>`,
    sun: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 1h2v3h-2V1zm0 19h2v3h-2v-3zM1 11h3v2H1v-2zm19 0h3v2h-3v-2zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1zm12.1 12.1l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1zM18.4 4.2l1.4 1.4-2.1 2.1-1.4-1.4 2.1-2.1zM6.3 16.3l1.4 1.4-2.1 2.1-1.4-1.4 2.1-2.1zM12 7a5 5 0 100 10 5 5 0 000-10z"/></svg>`,
    moon: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.3 3a9 9 0 108.7 11.4A7.5 7.5 0 0112.3 3z"/></svg>`,
    soundOn: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3V9zm13.5 3a3.5 3.5 0 00-2-3.2v6.4c1.2-.6 2-1.8 2-3.2zm2.5 0c0 3-1.8 5.6-4.5 6.7v-2.2a5 5 0 000-9V5.3C17.2 6.4 19 9 19 12z"/></svg>`,
    soundOff: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3V9zm13.6 3l2.7 2.7-1.4 1.4-2.7-2.7-2.7 2.7-1.4-1.4 2.7-2.7-2.7-2.7 1.4-1.4 2.7 2.7 2.7-2.7 1.4 1.4-2.7 2.7z"/></svg>`,
    coin: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 4.5L15.5 12 12 17.5 8.5 12 12 6.5z"/></svg>`,
    skill: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z"/></svg>`,
    skull: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 3a8 8 0 00-8 8c0 2.8 1.4 5.2 3.5 6.6V21h3v-2h1v2h1v-2h1v2h3v-3.4A8 8 0 0020 11a8 8 0 00-8-8zm-3 9.5a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zm6 0a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6z"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5h2v4.6l3.2 1.9-1 1.7L11 12.8V7z"/></svg>`,
    retry: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 4V1L7 6l5 5V7a6 6 0 11-6 6H4a8 8 0 108-9z"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.2 16.6L4.6 12 6 10.6l3.2 3.2 8.8-8.8L19.4 6.4 9.2 16.6z"/></svg>`,
    emote: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2a10 10 0 100 20 10 10 0 000-20zM8.5 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm7 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM7.8 14h8.4a4.4 4.4 0 01-8.4 0z"/></svg>`,
    bolt: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>`,
    left: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.4 6.4L14 5l-7 7 7 7 1.4-1.4L9.8 12l5.6-5.6z"/></svg>`,
    right: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.6 17.6L10 19l7-7-7-7-1.4 1.4L14.2 12l-5.6 5.6z"/></svg>`,
    up: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 6l7 7-1.4 1.4L12 8.8l-5.6 5.6L5 13l7-7z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9z"/></svg>`,
    cloud: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 19h9.8a4.7 4.7 0 00.7-9.3A6.5 6.5 0 005.3 8.2 5.5 5.5 0 007.5 19z"/></svg>`,
    users: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 11a4 4 0 100-8 4 4 0 000 8zm7.5-1a3 3 0 100-6 3 3 0 000 6zM9 13c-3.9 0-7 2-7 4.5V20h14v-2.5C16 15 12.9 13 9 13zm7.5.2c1.1.7 1.8 1.7 1.8 2.9V20H22v-2.2c0-2-2.4-3.7-5.5-4.6z"/></svg>`,
    ghost: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2a8 8 0 00-8 8v11l2.7-2.2L9.3 21 12 18.8 14.7 21l2.6-2.2L20 21V10a8 8 0 00-8-8zm-3 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm6 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/></svg>`,
    card: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm4 3h5v5H7V8zm0 7h10v2H7v-2zm7-6h3v2h-3V9zm0 3h3v2h-3v-2z"/></svg>`,
    fullscreen: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h7v2.5H5.5V10H3V3zm11 0h7v7h-2.5V5.5H14V3zM3 14h2.5v4.5H10V21H3v-7zm15.5 4.5V14H21v7h-7v-2.5h4.5z"/></svg>`,
    fullscreenExit: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 3H10v7H3V7.5h4.5V3zm9 4.5H21V10h-7V3h2.5v4.5zM3 14h7v7H7.5v-4.5H3V14zm11 0h7v2.5h-4.5V21H14v-7z"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM5 18.5C5 15.5 8.1 13.5 12 13.5s7 2 7 5V21H5v-2.5z"/></svg>`,
    logout: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 3h9v3H7v12h6v3H4V3zm12.3 4.3L21 12l-4.7 4.7-1.8-1.8 1.7-1.7H10v-2.4h6.2l-1.7-1.7 1.8-1.8z"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2a5 5 0 00-5 5v3H5v12h14V10h-2V7a5 5 0 00-5-5zm3 8V7a3 3 0 10-6 0v3h6zm-4 4h2v4h-2v-4z"/></svg>`,
    key: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.5 6a5.5 5.5 0 104.9 8H16v2.5h2.5V14H22v-3h-9.6A5.5 5.5 0 007.5 6zm0 3.5a2 2 0 100 4 2 2 0 000-4z"/></svg>`,
    pin: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 3h4v4H4V3zm6 0h4v4h-4V3zm6 0h4v4h-4V3zM4 9h4v4H4V9zm6 0h4v4h-4V9zm6 0h4v4h-4V9zM4 15h4v4H4v-4zm6 0h4v6h-4v-6zm6 0h4v4h-4v-4z"/></svg>`,
    fingerprint: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a9.5 9.5 0 00-8.2 4.7l1.8 1A7.4 7.4 0 0112 4.1a7.4 7.4 0 016.4 3.6l1.8-1A9.5 9.5 0 0012 2zm0 4.2a6.3 6.3 0 00-6.3 6.3v4.2h2.1v-4.2a4.2 4.2 0 018.4 0v5.8h2.1v-5.8A6.3 6.3 0 0012 6.2zm0 4a2.3 2.3 0 00-2.3 2.3v8.3h2.1v-8.3a.4.4 0 01.8 0v6.6h2.1v-6.6A2.5 2.5 0 0012 10.2zm-7.8 2.3H2.1v3.8c0 2.1.6 3.9 1.7 5.3l1.7-1.3c-.8-1-1.3-2.4-1.3-4v-3.8zm15.6 0v3.8c0 1.6-.5 3-1.3 4l1.7 1.3c1.1-1.4 1.7-3.2 1.7-5.3v-3.8h-2.1z"/></svg>`,
    faceid: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h5v2.3H5.3V8H3V3zm13 0h5v5h-2.3V5.3H16V3zM3 16h2.3v2.7H8V21H3v-5zm15.7 2.7V16H21v5h-5v-2.3h2.7zM8 8.5h2.2v3H8v-3zm5.8 0H16v3h-2.2v-3zM11.2 9h2v5.2h-2.6v-1.8h.6V9zm-2.7 6.8l1.4-1.5c1.1 1 3.1 1 4.2 0l1.4 1.5c-1.9 1.7-5.1 1.7-7 0z"/></svg>`,
    eye: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 5C6.5 5 2.1 8.4 1 12c1.1 3.6 5.5 7 11 7s9.9-3.4 11-7c-1.1-3.6-5.5-7-11-7zm0 11a4 4 0 100-8 4 4 0 000 8zm0-2a2 2 0 100-4 2 2 0 000 4z"/></svg>`,
    eyeOff: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.3 2L2 3.3l3.1 3.1C3.2 7.8 1.7 9.8 1 12c1.1 3.6 5.5 7 11 7 2.1 0 4.1-.6 5.8-1.5l2.9 2.9 1.3-1.3L3.3 2zm8.7 14a4 4 0 01-4-4c0-.6.1-1.1.4-1.6l5.2 5.2c-.5.3-1 .4-1.6.4zm0-11c-1.6 0-3.1.4-4.5 1l2.2 2.2A4 4 0 0116 12c0 .5-.1 1-.3 1.4l3 3c1.8-1.2 3.6-2.7 4.3-4.4-1.1-3.6-5.5-7-11-7z"/></svg>`
  };

  window.ExoticIcons = {
    get(name) {
      return ICONS[name] || '';
    }
  };
})();
