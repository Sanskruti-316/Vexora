// Async handler wrapper that catches promise rejections and forwards to express error handling
export const h = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error("API Error:", err);
    res.status(err.status || 400).json({ error: err.message || "An error occurred" });
  });
};

export const errorHandler = (err, req, res, next) => {
  console.error("Central Error Handler:", err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
  });
};
