const buildErrorList = (fieldErrors) => {
  const list = [];
  // You could make this generic by iterating keys, but explicit is fine too
  if (fieldErrors.title) list.push({ text: fieldErrors.title[0], href: "#title" });
  if (fieldErrors.description) list.push({ text: fieldErrors.description[0], href: "#description" });
  if (fieldErrors.due_date) list.push({ text: fieldErrors.due_date[0], href: "#due_date" });
  return list;
};

module.exports = { buildErrorList };