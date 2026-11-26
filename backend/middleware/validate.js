export const posInt = (v, msg = "Invalid quantity") => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(msg);
    err.status = 400;
    throw err;
  }
  return n;
};

export const posFloat = (v, msg = "Invalid length") => {
  const n = parseFloat(v);
  if (isNaN(n) || n <= 0) {
    const err = new Error(msg);
    err.status = 400;
    throw err;
  }
  return n;
};

export const validatePhone = (p, fallback = "+91 9999900000") => {
  if (!p) return fallback;
  const str = String(p).trim();
  if (str.startsWith("-") || /[a-zA-Z]/.test(str)) {
    throw new Error("Phone number cannot be negative or contain alphabetic characters.");
  }
  const digitsOnly = str.replace(/\D/g, "");
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    throw new Error("Phone number must contain between 10 and 15 digits.");
  }
  return str.startsWith("+") ? str : `+${str}`;
};
