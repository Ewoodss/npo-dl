function parseBoolean(str) {
  if (str === "true") return true;
  if (str === "false") return false;
  if (str === undefined) return str;
  // Handle cases where the string is neither 'true' nor 'false'
  throw new Error("Invalid boolean string");
}

export { parseBoolean };
