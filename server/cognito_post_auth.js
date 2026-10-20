const pino = require("pino");
const logger = pino();

module.exports.handler = async (event) => {
  logger.info(
    {
      userId: event.userName,
      trigger: event.triggerSource,
    },
    "User logged in",
  );

  return event;
};
