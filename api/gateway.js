const handleRequest = require('../server');

module.exports = async function exoticVercelGateway(req, res) {
  return handleRequest(req, res);
};
