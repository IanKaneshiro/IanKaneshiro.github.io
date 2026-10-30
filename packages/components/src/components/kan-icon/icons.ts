/** One line-icon set on a 24px grid, drawn with currentColor strokes (KIT-012). */
export const ICONS = {
  github:
    "M5 9.5 6 4l4 2.5h4L18 4l1 5.5c1.2 2 .8 6.5-2.5 8H7.5C4.2 16 3.8 11.5 5 9.5Z M9.5 12v1 M14.5 12v1 M9 17.5c-2.5 1.5-4.5.5-5.5-1.5",
  linkedin: "M4 4h16v16H4Z M8 10.5V16 M8 7.5v.01 M11.5 16v-5.5 M11.5 13a2.5 2.5 0 0 1 5 0v3",
  mail: "M3 5.5h18v13H3Z M3.5 6.5l8.5 6 8.5-6",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
  sun: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
  moon: "M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z",
  monitor: "M3 4h18v12H3Z M8 20h8 M12 16v4",
  terminal: "M3 4h18v16H3Z M7 9l3 3-3 3 M12.5 15h4.5",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "M6 6l12 12 M18 6 6 18",
} as const;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];
