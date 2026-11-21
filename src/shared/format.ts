/** Explicit UTC+8 formatting prevents the server and browser locales from changing the display. */
export function modifiedTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}`;
}
