import type express from "fulmine.js";

const errorHandler: express.ErrorRequestHandler = (err, req, res, _next) => {
	const statusCode = err.statusCode || 500;
	const response = {
		success: false,
		status: statusCode,
		message: err.message,
		errors: err.errors?.length > 0 ? err.errors : undefined,
		stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
		timestamp: new Date().toISOString(),
		path: req.originalUrl,
	};
	console.error(err);

	res.status(statusCode).json(response);
};
export default errorHandler;
