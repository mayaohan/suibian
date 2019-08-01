'use strict';

var formats = require('./formats').formats;
var common = require('./common'),
    getType = common.getType,
    prettyType = common.prettyType,
    isOfType = common.isOfType,
    getName = common.getName,
    deepEquals = common.deepEquals;

function throwInvalidValue(names, value, expected) {
	throw new Error('JSON object' + getName(names) + ' is ' + value + ' when it should be ' + expected);
}

function throwInvalidAttributeValue(names, attribFullName, value, expected) {
	throw new Error('JSON object' + getName(names) + ': ' + attribFullName + ' is ' + value + ' when it should be ' + expected);
}

function throwInvalidType(names, value, expected) {
	throw new Error('JSON object' + getName(names) + ' is ' + prettyType(getType(value)) + ' when it should be ' + expected);
}

function throwInvalidDisallow(names, value, expected) {
	throw new Error('JSON object' + getName(names) + ' is ' + prettyType(getType(value)) + ' when it should not be ' + expected);
}

function validateRequired(obj, schema, names) {
	if (schema.required) {
		if (obj === undefined) {
			throw new Error('JSON object' + getName(names) + ' is required');
		}
	}
}

function applyDefault(obj, schema, names) {
	if (schema.default !== undefined) {
		obj = schema.default;
	}

	return obj;
}

function validateType(obj, schema, names) {
	if (schema.type !== undefined) {
		switch (getType(schema.type)) {
			case 'string':
				if (!isOfType(obj, schema.type)) {
					if (getType(obj) === 'string') {
						try {
							obj = JSON.parse(obj);
						} catch (e) {}
					}
					if (!isOfType(obj, schema.type)) {
						throwInvalidType(names, obj, prettyType(schema.type));
					}
				}
				break;
			case 'array':
				for (var i = 0; i < schema.type.length; ++i) {
					switch (getType(schema.type[i])) {
						case 'string':
							if (isOfType(obj, schema.type[i])) {
								return;
							}
							break;
						case 'object':
							try {
								return validateSchema(obj, schema.type[i], names);
							} catch (err) {}
							break;
					}
				}
				throwInvalidType(names, obj, 'either ' + schema.type.map(prettyType).join(' or '));
				break;
		}
	}
	return obj;
}

function validateDisallow(obj, schema, names) {
	if (schema.disallow !== undefined) {
		switch (getType(schema.disallow)) {
			case 'string':
				if (isOfType(obj, schema.disallow)) {
					throwInvalidDisallow(names, obj, prettyType(schema.disallow));
				}
				break;
			case 'array':
				for (var i = 0; i < schema.disallow.length; ++i) {
					switch (getType(schema.disallow[i])) {
						case 'string':
							if (isOfType(obj, schema.disallow[i])) {
								throwInvalidType(names, obj, 'neither ' + schema.disallow.map(prettyType).join(' nor '));
							}
							break;
						case 'object':
							try {
								validateSchema(obj, schema.disallow[i], names);
							} catch (err) {
								continue;
							}
							throwInvalidType(names, obj, 'neither ' + schema.disallow.map(prettyType).join(' nor '));

							break;
					}
				}
				break;
		}
	}
}

function validateEnum(obj, schema, names) {
	if (schema['enum'] !== undefined) {
		for (var i = 0; i < schema['enum'].length; ++i) {
			if (deepEquals(obj, schema['enum'][i])) {
				return;
			}
		}
		throw new Error('JSON object' + getName(names) + ' is not in enum');
	}
}

function validateArray(obj, schema, names) {
	var i, j;

	if (schema.minItems !== undefined) {
		if (obj.length < schema.minItems) {
			throwInvalidAttributeValue(names, 'number of items', obj.length, 'at least ' + schema.minItems);
		}
	}

	if (schema.maxItems !== undefined) {
		if (obj.length > schema.maxItems) {
			throwInvalidAttributeValue(names, 'number of items', obj.length, 'at most ' + schema.maxItems);
		}
	}

	if (schema.items !== undefined) {
		switch (getType(schema.items)) {
			case 'object':
				for (i = 0; i < obj.length; ++i) {
					obj[i] = validateSchema(obj[i], schema.items, names.concat(['[' + i + ']']));
				}
				break;
			case 'array':
				var numChecks = Math.min(obj.length, schema.items.length);
				for (i = 0; i < numChecks; ++i) {
					obj[i] = validateSchema(obj[i], schema.items[i], names.concat(['[' + i + ']']));
				}
				if (obj.length > schema.items.length) {
					if (schema.additionalItems !== undefined) {
						if (schema.additionalItems === false) {
							throwInvalidAttributeValue(names, 'number of items', obj.length, 'at most ' + schema.items.length + ' - the length of schema items');
						}
						for (; i < obj.length; ++i) {
							obj[i] = validateSchema(obj[i], schema.additionalItems, names.concat(['[' + i + ']']));
						}
					}
				}
				break;
		}
	}

	if (schema.uniqueItems !== undefined) {
		for (i = 0; i < obj.length - 1; ++i) {
			for (j = i + 1; j < obj.length; ++j) {
				if (deepEquals(obj[i], obj[j])) {
					throw new Error('JSON object' + getName(names) + ' items are not unique: element ' + i + ' equals element ' + j);
				}
			}
		}
	}
}

function validateObject(obj, schema, names) {
	var prop, property;
	if (schema.properties !== undefined) {
		for (property in schema.properties) {
			prop = validateSchema(obj[property], schema.properties[property], names.concat([property]));
			if (prop === undefined) {
				delete obj[property];
			} else {
				obj[property] = prop;
			}
		}
	}

	var matchingProperties = {};
	if (schema.patternProperties !== undefined) {
		for (var reStr in schema.patternProperties) {
			var re = RegExp(reStr);
			for (property in obj) {
				if (property.match(re)) {
					matchingProperties[property] = true;
					prop = validateSchema(obj[property], schema.patternProperties[reStr], names.concat(['patternProperties./' + property + '/']));
					if (prop === undefined) {
						delete obj[property];
					} else {
						obj[property] = prop;
					}
				}
			}
		}
	}

	for (property in obj) {
		if (schema.properties !== undefined && property in schema.properties) {
			continue;
		}
		if (property in matchingProperties) {
			continue;
		}

		if (schema.properties && !schema.additionalProperties) {
			delete obj[property];
			continue;
		} else {}
	}


	if (schema.dependencies !== undefined) {
		for (property in schema.dependencies) {
			switch (getType(schema.dependencies[property])) {
				case 'string':
					if (property in obj && !(schema.dependencies[property] in obj)) {
						throw new Error('JSON object' + getName(names.concat([schema.dependencies[property]])) + ' is required by property \'' + property + '\'');
					}
					break;
				case 'array':
					for (var i = 0; i < schema.dependencies[property].length; ++i) {
						if (property in obj && !(schema.dependencies[property][i] in obj)) {
							throw new Error('JSON object' + getName(names.concat([schema.dependencies[property][i]])) + ' is required by property \'' + property + '\'');
						}
					}
					break;
				case 'object':
					validateSchema(obj, schema.dependencies[property], names.concat(['[dependencies.' + property + ']']));
					break;
			}
		}
	}
}

function validateNumber(obj, schema, names) {

	if (schema.minimum !== undefined) {
		if (schema.exclusiveMinimum ? obj <= schema.minimum : obj < schema.minimum) {
			throwInvalidValue(names, obj, (schema.exclusiveMinimum ? 'greater than' : 'at least') + ' ' + schema.minimum);
		}
	}

	if (schema.maximum !== undefined) {
		if (schema.exclusiveMaximum ? obj >= schema.maximum : obj > schema.maximum) {
			throwInvalidValue(names, obj, (schema.exclusiveMaximum ? 'less than' : 'at most') + ' ' + schema.maximum);
		}
	}

	if (schema.divisibleBy !== undefined) {
		if (!isOfType(obj / schema.divisibleBy, 'integer')) {
			throwInvalidValue(names, obj, 'divisible by ' + schema.divisibleBy);
		}
	}
}

function validateString(obj, schema, names) {

	if (schema.minLength !== undefined) {
		if (obj.length < schema.minLength) {
			throwInvalidAttributeValue(names, 'length', obj.length, 'at least ' + schema.minLength);
		}
	}

	if (schema.maxLength !== undefined) {
		if (obj.length > schema.maxLength) {
			throwInvalidAttributeValue(names, 'length', obj.length, 'at most ' + schema.maxLength);
		}
	}

	if (schema.pattern !== undefined) {
		if (!obj.match(RegExp(schema.pattern))) {
			throw new Error('JSON object' + getName(names) + ' does not match pattern');
		}
	}
}

function validateFormat(obj, schema, names) {
	if (schema.format !== undefined) {
		var format = formats[schema.format];
		if (format !== undefined) {
			var conforms = true;
			if (format.regex) {
				conforms = obj.match(format.regex);
			} else if (format.func) {
				conforms = format.func(obj);
			}
			if (!conforms) {
				throw new Error('JSON object' + getName(names) + ' does not conform to the \'' + schema.format + '\' format');
			}
		}
	}
}

function validateItem(obj, schema, names) {
	switch (getType(obj)) {
		case 'number':
		case 'integer':
			validateNumber(obj, schema, names);
			break;
		case 'string':
			validateString(obj, schema, names);
			break;
	}

	validateFormat(obj, schema, names);
}

function validateSchema(obj, schema, names) {

	validateRequired(obj, schema, names);
	if (obj === undefined) {
		obj = applyDefault(obj, schema, names);
	}
	if (obj !== undefined) {
		obj = validateType(obj, schema, names);
		validateDisallow(obj, schema, names);
		validateEnum(obj, schema, names);

		switch (getType(obj)) {
			case 'object':
				validateObject(obj, schema, names);
				break;
			case 'array':
				validateArray(obj, schema, names);
				break;
			default:
				validateItem(obj, schema, names);
		}
	}

	return obj;
}

module.exports = function (obj, schema, done) {
	try {
		validateSchema(obj, schema, []);
	} catch (err) {
		if (done) {
			done(err);
			return;
		} else {
			throw err;
		}
	}

	if (done) {
		done(null, obj);
	}
};