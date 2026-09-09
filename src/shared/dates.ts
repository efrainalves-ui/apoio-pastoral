export function localDateKey(date = new Date()): string {
  const twoDigits = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`
}

export function localDateTimeKey(date = new Date()): string {
  const twoDigits = (value: number) => String(value).padStart(2, '0')
  return `${localDateKey(date)}T${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
}
