// Read the original user payload from Responses string or message-array input.
module.exports = function responseInput(body) {
  const user = Array.isArray(body.input) ? body.input.find(message => message.role === 'user') : null;
  const text = user ? typeof user.content === 'string' ? user.content : user.content.find(part => part.type === 'input_text').text : body.input;
  return JSON.parse(text);
};
