/* api/_shared/errors.js — an error that carries the HTTP status and the message the
   browser should see; the shared endpoint wrapper turns it into the response. */

class HttpError extends Error {
  constructor(status, message, cause) {
    super(message);
    this.status = Number.isInteger(status) ? status : 500;
    if (cause) this.cause = cause;
  }
}

module.exports = { HttpError };
