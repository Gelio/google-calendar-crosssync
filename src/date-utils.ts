export const getStartOfDay = (date = new Date()) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const advanceByDays = (date: Date, daysToAdvance: number) => {
  const advancedDate = new Date(date);
  advancedDate.setDate(date.getDate() + daysToAdvance);
  return advancedDate;
};
