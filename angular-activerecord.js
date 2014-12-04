/**
 * @licence ActiveRecord for AngularJS
 * (c) 2013-2014 Bob Fanger, Jeremy Ashkenas, DocumentCloud
 * License: MIT
 */
angular.module('ActiveRecord', []).factory('ActiveRecord', ['$http', '$q', '$parse', '$injector', function($http, $q, $parse, $injector) {
	'use strict';

	/**
	 * If the value of the named property is a function then invoke it; otherwise, return it.
	 * @param {Object} object
	 * @param {String} property
	 * @ignore
	 */
	var _result = function (object, property) {
		if (object == null) return null;
		var value = object[property];
		return angular.isFunction(value) ? value.call(object) : value;
	};

	var _ucfirst = function(string) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	};

	var _lcfirst = function(string) {
		return string.charAt(0).toLowerCase() + string.slice(1);
	};

	/**
	 * Apply the filters to the properties.
	 *
	 * @param {Object|null} filters The $readFilters or $writeFilters.
	 * @param {Object} properties
	 * @ignore
	 */
	var applyFilters = function (filters, properties) {
		if (filters) {
			angular.forEach(filters, function (filter, path) {
				var expression = $parse(path);
				var value = expression(properties);
				if (angular.isDefined(value)) {
					var newValue = (angular.isFunction(filter)) ? filter(value) : $parse(path + '|' + filter)(properties);
					expression.assign(properties, newValue);
				}
			});
		}
	};

	/**
	 * @class ActiveRecord  ActiveRecord for AngularJS
	 * @constructor
	 * @param {Object} [properties]  Initialize the record with these property values.
	 * @param {Object} [options]
	 */
	var ActiveRecord = function ActiveRecord(properties, options) {
		this.$initialize.apply(this, arguments);
	};
	ActiveRecord.prototype = {

		/**
		 * @property {String} $idAttribute  The default name for the JSON id attribute is "id".
		 */
		$idAttribute: 'id',

		/**
		 * @property {String} $urlRoot  Used by $url to generate URLs based on the model id. "[urlRoot]/id"
		 */
		$urlRoot: null,

		$nullValues: [null, undefined],

		$emptyValues: function() { return [""].concat(this.$nullValues); },

		/**
		 * Constructor logic
		 * (which is called by the autogenerated constructor via ActiveRecord.extend)
		 * @param {Object} [properties]  Initialize the record with these property values.
		 * @param {Object} [options]
		 */
		$initialize: function (properties, options) {
			options = options || {};
			var defaults = _result(this, '$defaults');
			if (defaults) {
				angular.extend(this, defaults);
			}
			if (properties) {
				if (options.parse) {
					properties = this.$parse(properties);
				}
				if (options.readFilters) {
					applyFilters(_result(this, '$readFilters'), properties);
				}
				angular.extend(this, properties);
				var data = angular.copy(properties);
				this.$previousAttributes = function () {
					return data;
				};
			}
			if (options.url) {
				this.$url = options.url;
			}
			if (options.urlRoot) {
				this.$urlRoot = options.urlRoot;
			}

			this.$errors = {};
		},

		$hasAttributes: function(attrs) {
			var model = this;
			var isValid = true;
			angular.forEach(attrs, function(v, k) {
				if (model[k] !== v && !angular.isFunction(v)) {
					isValid = false;
				}
			});
			return isValid;
		},

		$getAttributes: function () {
			var model = this;
			var object = {};
			angular.forEach(model.$attributes, function(v) {
				object[v] = model[v];
			});
			return object;
		},

		/**
		 * Determine if the model has changed since the last sync (fetch/load).
		 *
		 * @param {String} [property] Determine if that specific property has changed.
		 * @returns {Boolean}
		 */
		$hasChanged: function (property) {
			var changed = this.$changedAttributes();
			if (property) {
				return property in changed;
			}
			for (var i in changed) {
				return true;
			}
			return false;
		},

		$attributeInAssociation: function(attr) {
			var inAssoc = false;
			attr = attr.toLowerCase();
			angular.forEach(this.$associations, function(assoc, key) {
				key = key.toLowerCase();
				if (attr == key || (assoc.options.through && assoc.options.through.toLowerCase() == key)) inAssoc = true;
			});
			return inAssoc;
		},

		/**
		 * Return an object containing all the properties that have changed.
		 * Removed properties will be set to undefined.
		 *
		 * @param {Object} [diff] An object to diff against, determining if there would be a change.
		 * @returns {Object}
		 */
		$changedAttributes: function (diff) {
			var current = diff || this; // By default diff against the current values
			var changed = {};
			var previousAttributes = this.$previousAttributes();
			if (!diff) { // Skip removed properties (only compare the properties in the diff object)
				for (var property in previousAttributes) {
					if (typeof current[property] === 'undefined' && typeof previousAttributes[property] !== 'undefined') {
						changed[property] = current[property];
					}
				}
			}

			for (var property in current) {
				if (current.hasOwnProperty(property) && property.indexOf("$") !== 0 && !this.$attributeInAssociation(property)) {
					var value = current[property];
					if (typeof value !== 'function' && angular.equals(value, previousAttributes[property]) === false && (!this.$attributes || this.$attributes.indexOf(property) !== -1)) {
						changed[property] = value;
					}
				}
			}
			return changed;
		},

		/**
		 * Get the previous value of a property.
		 * @param {String} [property]
		 */
		$previous: function (property) {
			var previousAttributes = this.$previousAttributes();
			if (property == null || !previousAttributes) {
				return null;
			}
			return previousAttributes[property];
		},

		/**
		 * Get all of the properties of the model at the time of the previous sync (fetch/save).
		 * @returns {Object}
		 */
		$previousAttributes: function () {
			return {};
		},

		$toCamelCase: function(string) {
			var camelCase = string.replace (/(?:^|[-_])(\w)/g, function (_, c) {
				return c ? c.toUpperCase () : '';
			});
			return camelCase;
		},

		$computeData: function(data) {
			data = data || this;
			var model = this;
			angular.forEach(data, function(value, key) {
				var camelCaseKey = model.$toCamelCase(key);
				var lowerCaseKey = camelCaseKey.toLowerCase();
				var assocName = null;
				var module = null;
				angular.forEach(model.$associations, function(valueAssoc, keyAssoc) {
					var Assoc = null;
					if ($injector.has(keyAssoc)) {
						Assoc = $injector.get(keyAssoc);
					} else if (valueAssoc.options.model && $injector.has(valueAssoc.options.model)) {
						Assoc = $injector.get(valueAssoc.options.model);
					}

					if (lowerCaseKey == keyAssoc.toLowerCase()) {
						assocName = keyAssoc;
					} else if (lowerCaseKey == Assoc.prototype.$plural.toLowerCase()) {
						assocName = Assoc.prototype.$plural;
						module = keyAssoc;
					} else if (valueAssoc.options.through) {
						var Related = $injector.get(valueAssoc.options.through);
						var relName = Related.prototype.$plural || Related.prototype.$name || valueAssoc.options.through;
						if (lowerCaseKey == relName.toLowerCase()) {
							module = valueAssoc.options.through;
							assocName = relName;
						}
					}
					if (valueAssoc.options.model) {
						module = valueAssoc.options.model;
					}
				});
				if (assocName) {
					if (!module) module = assocName;
					var lowerCamelCaseKey = _lcfirst(assocName);
					model[lowerCamelCaseKey] = [];
					var AssocModel = $injector.get(module);
					if (angular.isArray(value)) {
						angular.forEach(value, function(v) {
							var assocModel = new AssocModel();
							v = assocModel.$parse(v);
							assocModel.$computeData(v);
							model[lowerCamelCaseKey].push(assocModel);
						});
					} else {
						var assocModel = new AssocModel();
						value = assocModel.$parse(value);
						assocModel.$computeData(value);
						model[lowerCamelCaseKey] = assocModel;
					}
				} else {
					model[key] = value;
				}
			});
			data = angular.copy(model);
			model.$previousAttributes = function () {
				return data;
			};
			return model;
		},

		/**
		 * (re)load data from the backend.
		 * @param {Object} [options] sync options
		 * @return $q.promise
		 */
		$fetch: function (options) {
			var model = this;
			var deferred = $q.defer();
			this.$sync('read', this, options).then(function (response) {
				var data = model.$parse(response.data, options);
				if (angular.isObject(data)) {
					applyFilters(_result(model, '$readFilters'), data);
					model.$computeData(data);
					model.$validate();
					data = angular.copy(model);
					model.$previousAttributes = function () {
						return data;
					};
					deferred.resolve(model);
				} else {
					deferred.reject('Not a valid response type');
				}
			}, deferred.reject);
			return deferred.promise;
		},

		$validationErrorMessages: {},

		$validations: {},

		$fieldTranslations: {},

		$isValid: function(fieldName) {
			var valid = false;
			if (Object.keys(this.$errors).length === 0) {
				valid = true;
			} else if (fieldName && !this.$errors[fieldName]) {
				valid = true;
			}
			return valid;
		},

		$getErrorMessage: function(fieldName, functionName) {
			var validationValue = this.$validations[fieldName][functionName];
			var fieldValue = this[fieldName];
			var errorMessage = this.$validationErrorMessages.hasOwnProperty(functionName) ? this.$validationErrorMessages[functionName] : "is invalid";
			if (angular.isFunction(errorMessage)) errorMessage = errorMessage(fieldName, fieldValue, validationValue, this);
			if (typeof sprintf !== "undefined") {
				if(!errorMessage.errorMessage){
					errorMessage = sprintf(errorMessage, {fieldName: this.$fieldTranslations[fieldName] || fieldName, fieldValue: fieldValue, validationValue: validationValue});
				} else {
					errorMessage.fieldName = this.$fieldTranslations[fieldName] || fieldName;
					errorMessage.fieldValue = fieldValue;
					errorMessage.validationValue = validationValue;
					errorMessage = sprintf(errorMessage.errorMessage, errorMessage);
				}
			}
			return errorMessage;
		},

		$applyValidation: function(fieldName, fieldValue, errors) {
			if (!errors) errors = [];
			var mthis = this;
			angular.forEach(this.$validations[fieldName], function(validationValue, functionName) {
				if (functionName != "required" && functionName != "notEmpty" && mthis[functionName]) {
					if (mthis[functionName](fieldValue, validationValue) !== true) {
						errors.push(mthis.$getErrorMessage(fieldName, functionName));
					}
				}
			});
			return errors;
		},

		$validateOne: function(fieldName) {
			var errors = [];
			delete this.$errors[fieldName];
			if (this.$validations[fieldName]) {
				var mthis = this;
				if (mthis.hasOwnProperty(fieldName) && mthis[fieldName] !== null) {
					var props = typeof mthis[fieldName] == "object" && !angular.isDate(mthis[fieldName]) ? mthis[fieldName] : [mthis[fieldName]];
					var notEmptyValidation = false;
					if (mthis.$validations[fieldName].notEmpty) {
						if (mthis.$validations[fieldName].notEmpty !== true) {
							notEmptyValidation = mthis.$validations[fieldName].notEmpty;
						} else {
							notEmptyValidation = mthis.$emptyValues();
						}
					}
					var emptyError = true;
					if (mthis.$validations[fieldName].indexErrors) errors = {};
					angular.forEach(props, function(prop, index) {
						if (notEmptyValidation === false || notEmptyValidation.indexOf(prop) === -1) {
							emptyError = false;
							if (mthis.$validations[fieldName].indexErrors) {
								var err = mthis.$applyValidation(fieldName, prop, []);
								if (err.length)	errors[index] = err;
							} else {
								errors = mthis.$applyValidation(fieldName, prop, errors);
							}
						}
					});
					if (emptyError && this.$validations[fieldName].notEmpty) {
						errors.push(mthis.$getErrorMessage(fieldName, "notEmpty"));
					}
				} else if (this.$validations[fieldName].required) {
					var errMessage = null;
					if (angular.isObject(this.$validations[fieldName].required) && this.$validations[fieldName].required.message) {
						errMessage = this.$validations[fieldName].required.message;
					} else if (this.$validationErrorMessages.required) {
						errMessage = this.$validationErrorMessages.required;
					} else {
						errMessage = "is required";
					}
					if (angular.isFunction(errMessage)) errMessage = errMessage(fieldName);
					errors.push(errMessage);
				}
			}
			var errorArray = angular.isArray(errors) ? errors : Object.keys(errors);
			if (errorArray.length) {
				this.$errors[fieldName] = errors;
			}
			return this.$isValid(fieldName);
		},

		$validate: function(fieldName) {
			if (fieldName) return this.$validateOne(fieldName);

			var mthis = this;
			this.$errors = {};
			angular.forEach(this.$validations, function(validation, validationKey) {
				mthis.$validateOne(validationKey);
			});
			return this.$isValid();
		},

		$saveBelongsToAssociations: function(values, options, deferred) {
			var model = this;
			// we want to save associations before.. so we need some callback stuff
			var nbrLeft = 0;
			var nbrFound = 0;
			var err = false;
			var assocsaveCallbackContainer = function(assoc) {
				return function() {
					if (err) return;
					if (assoc.$isNew()) {
						err = true;
						return deferred.reject();
					}
					nbrLeft--;
					if (nbrLeft === 0) {
						model.$save(values, options).then(function(model) {
							deferred.resolve(model);
						}).catch(function(err) {
							deferred.reject(err);
						});
					}
				};
			};
			// get all associations data and save them if needed
			angular.forEach(this.$associations, function(assocObj, assocKey) {
				var keyName = assocKey;
				if (assocObj.options.singular) keyName = assocObj.options.singular;
				keyName = _lcfirst(keyName);
				var assoc = model["$" + keyName];
				if (assoc && assocObj.type == "belongsTo") {
					if (assoc.$isNew()) {
						nbrFound++;
						nbrLeft++;
						assoc.$save().then(
							assocsaveCallbackContainer(assoc)
						).catch(function(error) {
							err = true;
							deferred.reject(error);
						});
					} else {
						model[assocObj.options.key] = assoc[assoc.$idAttribute];
					}
				}
			});

			return nbrFound;
		},

		$saveHasManyAssociations: function(deferred) {
			var model = this;
			var nbrLeft = 0;
			var nbrFound = 0;
			var err = false;

			var assocsaveCallbackContainer = function(assoc) {
				return function() {
					if (err) return;
					if (assoc.$isNew()) {
						err = true;
						return deferred.reject();
					}
					nbrLeft--;
					if (nbrLeft === 0) {
						deferred.resolve(model);
					}
				};
			};
			angular.forEach(this.$associations, function(assocObj, assocKey) {
				var Related = $injector.get(assocObj.options.through || assocKey);
				var keyName = Related.prototype.$plural || Related.prototype.$name || assocObj.options.through;
				var parentManaged = !!assocObj.options.parentManaged;

				if (parentManaged) {
				  // Modifications will be sent as a delta of the parent object and managed directly. No need to make any other calls
				  return;
				}

				keyName = _lcfirst(keyName);
				var assocs = model[keyName];
				if (assocs && assocObj.type == "hasMany") {
					//delete assocs
					var oldAssoc = model.$previousAttributes()[keyName];
					if (oldAssoc && oldAssoc.length) {
						var ids = [];
						angular.forEach(assocs, function(obj) {
							ids.push(obj[obj.$idAttribute]);
						});
						var url = model.$url() + (Related.prototype.$urlRessource || assocKey);
						if (assocObj.options.batch) {
							var elements = [];
							angular.forEach(oldAssoc, function(obj) {
								if (ids.indexOf(obj[obj.$idAttribute]) === -1) {
									elements.push(obj);
								}
							});
							if (elements.length) {
								nbrFound++;
								nbrLeft++;
								Related.destroyAll(elements, {url: url}).then(
									assocsaveCallbackContainer()
								).catch(function(error) {
									err = true;
									callback(false, error);
								});
							}
						} else {
							angular.forEach(oldAssoc, function(obj) {
								if (ids.indexOf(obj[obj.$idAttribute]) === -1) {
									nbrFound++;
									nbrLeft++;
									obj.$destroy({url: url + "/" + obj[obj.$idAttribute]}).then(
										assocsaveCallbackContainer(obj)
									).catch(function(error) {
										err = true;
										callback(false, error);
									});
								}
							});
						}
					}
					angular.forEach(assocs, function(assoc) {
						if (assoc.$isNew() || assoc.$hasChanged()) {
							nbrFound++;
							nbrLeft++;
							assoc[assoc.$associations[model.$name].options.key] = model[model.$idAttribute];
							assoc.$save().then(
								assocsaveCallbackContainer(assoc)
							).catch(function(error) {
								err = true;
								deferred.reject(error);
							});
						}
					});
				}
			});

			return nbrFound;
		},

		/**
		 * Save the record to the backend.
		 * @param {Object} [values] Set these values before saving the record.
		 * @param {Object} [options] sync options
		 * @return $q.promise
		 */
		$save: function (values, options) {
			if (values) {
				if (angular.isString(values)) {
					values = {};
					values[arguments[0]] = options;
					options = arguments[2];
				}
				angular.extend(this, values);
			}
			var operation = this.$isNew() ? 'create' : 'update';
			var model = this;
			var deferred = $q.defer();
			if (!model.$validate()) {
				deferred.reject(model.$errors);
				return deferred.promise;
			}
			options = options || {};
			var filters = _result(this, '$writeFilters');
			//if we have found some associations not already saved, we need to wait for our callback to be called
			if (this.$saveBelongsToAssociations(values, options, deferred)) {
				return deferred.promise;
			}
			var tdata = this.$isNew() ? this : this.$changedAttributes();
			var data = {};
			angular.forEach(tdata, function(v, k) {
				if (!model.$attributeInAssociation(k)) {
					data[k] = v;
				}
			});
			if (filters) {
				options.data = angular.copy(data);
				applyFilters(filters, options.data);
			} else {
				options.data = angular.copy(data);
			}
			this.$sync(operation, this, options).then(function (response) {
				var data = model.$parse(response.data, options);
				if (angular.isObject(data)) {
					applyFilters(_result(model, '$readFilters'), data);
					angular.extend(model, data);
					data = angular.copy(model);
					model.$previousAttributes = function () {
						return data;
					};
					model.$computeData(data);
				}
				if (!model.$saveHasManyAssociations(deferred)) deferred.resolve(model);
			}).catch(function(err) {
				deferred.reject(err);
			});
			return deferred.promise;
		},

		/**
		 * Destroy this model on the server if it was already persisted.
		 * @param {Object} [options] sync options
		 * @return $q.promise
		 */
		$destroy: function (options) {
			var deferred = $q.defer();
			if (this.$isNew()) {
				deferred.resolve();
				return deferred.promise;
			}
			this.$sync('delete', this, options).then(function () {
				deferred.resolve();
			}, deferred.reject);
			return deferred.promise;
		},

		/**
		 * Generate the url for the $save, $fetch and $destroy methods.
		 * @return {String} url
		 */
		$url: function() {
			var urlRoot = _result(this, '$urlRoot');
			var urlRessource = _result(this, '$urlRessource');
			if (urlRessource) urlRoot += urlRessource;
			if (typeof this[this.$idAttribute] === 'undefined') {
				return urlRoot;
			}
			if (urlRoot === null) {
				throw 'Implement this.$url() or specify this.$urlRoot';
			}
			return urlRoot + (urlRoot.charAt(urlRoot.length - 1) === '/' ? '' : '/') + encodeURIComponent(this[this.$idAttribute]);
		},

		/**
		 * Process the data from the response and return the record-properties.
		 * @param {Object} data  The data from the sync response.
		 * @param {Object} [options] sync options
		 * @return {Object}
		 */
		$parse: function (data, options) {
			return data;
		},

		/**
		 * Process the record-properties and return the data for the resquest. (counterpart of $parse)
		 * Called automaticly by JSON.stringify: @link https://developer.mozilla.org/en-US/docs/JSON#toJSON()_method
		 */
		toJSON: function() {
			return this;
		},

		/**
		 * @property {Object} $readFilters
		 * Preform post-processing on the properties after $parse() through angular filters.
		 * These could be done in $parse(), but $readFilters enables a more reusable and declarative way.
		 */
		$readFilters: null,

		/**
		 * @property {Object} $writeFilters
		 * Preform pre-processing on the properties before $save() through angular filters.
		 * These could be done in toJSON(), but $readFilters enables a more reusable and declarative way.
		 */
		$writeFilters: null,

		/**
		 * A model is new if it lacks an id.
		 */
		$isNew: function () {
			return this[this.$idAttribute] == null;
		},

		/**
		 * By default calls ActiveRecord.sync
		 * Override to change the backend implementation on a per model bases.
		 * @param {String} operation  "create", "read", "update" or "delete"
		 * @param {ActiveRecord} model
		 * @param {Object} options
		 * @return $q.promise
		 */
		$sync: function (operation, model, options) {
			return ActiveRecord.sync.apply(this, arguments);
		},

		$associations: {}
	};

	/**
	 * Preform a CRUD operation on the backend.
	 *
	 * @static
	 * @param {String} operation  "create", "read", "update" or "delete"
	 * @param {ActiveRecord} model
	 * @param {Object} options
	 * @return $q.promise
	 */
	ActiveRecord.sync = function (operation, model, options) {
		if (typeof options === 'undefined') {
			options = {};
		}
		if (!options.method) {
			var crudMapping = {
				create: 'POST',
				read: 'GET',
				update: 'PUT',
				"delete": 'DELETE'
			};
			options.method = crudMapping[operation];
		}
		if (!options.url) {
			options.url = _result(model, '$url');
		}
		if (options.filters) {
			var extensions = [];
			angular.forEach(options.filters, function(filter, key) {
				if (angular.isArray(filter)) {
					angular.forEach(filter, function(value) {
						extensions.push(key + "[]=" + value);
					});
				} else {
					extensions.push(key + "=" + filter);
				}
			});
			options.url += "?" + extensions.join("&");
		}
		return $http(options);
	};

	ActiveRecord.lastId = 0;

	/**
	 * Create a subclass.
	 * @static
	 * @param {Object} protoProps
	 * @param {Object} [staticProps]
	 * @return {Function} Constructor
	 */
	ActiveRecord.extend = function(protoProps, staticProps) {
		var parent = this;
		var child;

		if (protoProps && typeof protoProps.$constructor === 'function') {
			child = protoProps.$constructor;
		} else {
			child = function () {
				this.$id = ++ActiveRecord.lastId;
				return parent.apply(this, arguments);
			};
		}
		angular.extend(child, parent, staticProps);
		var Surrogate = function () { this.$constructor = child; };
		Surrogate.prototype = parent.prototype;
		child.prototype = new Surrogate();
		if (protoProps) {
			angular.extend(child.prototype, protoProps);
		}
		child.__super__ = parent.prototype;
		child.prototype.$associations = {};
		return child;
	};

	ActiveRecord.hasMany = function(entity, options) {
		if (!options) options = {};
		if ($injector.has(entity) && (!options.through || $injector.has(options.through))) {
			var mthis = this;
			var Related = $injector.get(options.through || entity);
			var isThrough = !!options.through;
			var parentManaged = !!options.parentManaged;
			var relatedName = _lcfirst(Related.prototype.$plural || Related.prototype.$name || options.through);

			this.prototype.$associations[entity] = {type: "hasMany", options: options};

			this.prototype["add" + entity] = function(model, relatedData) {
				if (!parentManaged && model.$isNew()) return "can't be new";
				var options = this.$associations[entity].options;
				if (!relatedData) relatedData = {};
				var newEntity = null;
				if (isThrough) {
					newEntity = new Related(relatedData);
					newEntity["add" + entity](model);
				} else {
					newEntity = model;
				}
				if (!this[relatedName]) this[relatedName] = [];
				this[relatedName].push(newEntity);
				return this;
			};

			this.prototype["remove" + entity] = function(model, relatedData) {
				var options = this.$associations[entity].options;
				if (!relatedData) relatedData = {};
				var oldEntity = null;
				if (isThrough) {
					oldEntity = new Related(relatedData);
					oldEntity["remove" + entity](model);
				} else {
					oldEntity = model;
				}
				if (!this[relatedName]) this[relatedName] = [];
				if (!this[relatedName + "ToRemove"]) this[relatedName + "ToRemove"] = [];

				var index = _.findIndex(this[relatedName], function(entity){
				  if (entity === oldEntity) {
				    // Same object
				    return true;
				  } else if (entity[entity.$idAttribute] && oldEntity[entity.$idAttribute] && entity[entity.$idAttribute] == oldEntity[entity.$idAttribute]) {
				    // Standard says all entities have a unique attribute id (assuming they are the same type)
				    return true
				  } else if (entity.$id && oldEntity.$id && entity.$id == oldEntity.$id) {
				    // Not the same objet, but a copy of the same object, for new objets that don't have an id yet
				    return true;
				  }
				  return false;
				});

				if(index == -1){
					return "model not found";
				}

				this[relatedName + "ToRemove"].push(this[relatedName].splice(index, 1)[0]);
				return this;
			}
		}
	};

	ActiveRecord.belongsTo = function(entity, options) {
		if (!options) options = {};
		if ($injector.has(entity)) {
			var name = _lcfirst(entity);
			this.prototype.$associations[entity] = {type: "belongsTo", options: options};
			this.prototype["add" + entity] = function(model) {
				if (model.$isNew()) return "can't be new";
				var relatedKey = this.$associations[entity].options.key;
				this[name] = model;
				this[relatedKey] = model[model.$idAttribute];
				return model;
			};
		} else if (options.model && $injector.has(options.model)) {
			var name = _lcfirst(options.model);
			this.prototype.$associations[entity] = {type: "belongsTo", options: options};
			this.prototype["add" + entity] = function(model) {
				if (model.$isNew()) return "can't be new";
				var relatedKey = this.$associations[entity].options.key;
				this[name] = model;
				this[relatedKey] = model[model.$idAttribute];
				return model;
			};
		}
	};

	/**
	 * Load a single record.
	 *
	 * @static
	 * @param {Mixed} id
	 * @param {Object} [options]
	 * @return $q.promise
	 */
	ActiveRecord.fetchOne = function (id, options) {
		var model = new this();
		model[model.$idAttribute] = id;
		return model.$fetch(options);
	};

	ActiveRecord.destroyAll = function(models, options) {
		if (typeof options === 'undefined') {
			options = {};
		}
		options.filters = {ids: []};
		angular.forEach(models, function(model) {
			if (model[model.$idAttribute]) options.filters.ids.push(model[model.$idAttribute]);
		});
		options.method = 'DELETE';
		if (!options.url) options.url = _result(this.prototype, '$url');
		return ActiveRecord.sync(null, null, options);
	};

	/**
	 * Load a collection of records.
	 *
	 * @static
	 * @param {Object} [options]
	 * @return $q.promise
	 */
	ActiveRecord.fetchAll = function (options) {
		var ModelType = this;
		var model = new ModelType();
		var deferred = $q.defer();
		model.$sync('read', model, options).then(function (response) {
			var data = model.$parse(response.data, options);
			if (angular.isArray(data)) {
				var models = [];
				var filters = ModelType.prototype.$readFilters;
				angular.forEach(data, function (item) {
					applyFilters(filters, item);
					var newModel = new ModelType();
					newModel.$computeData(item);
					newModel.$validate();
					models.push(newModel);
				});
				deferred.resolve(models);
			} else if(data && data.meta && ( data.meta.count || data.meta.count == 0) && !isNaN(data.meta.count) && data.data && angular.isArray(data.data)) {
			  // This code has been added to allow for paginated results with a total count
			  var models = [];
			  var filters = ModelType.prototype.$readFilters;
			  angular.forEach(data.data, function (item) {
			    applyFilters(filters, item);
			    var newModel = new ModelType();
			    newModel.$computeData(item);
			    models.push(newModel);
			  });
			  deferred.resolve({count: data.meta.count, models: models});
			} else {
				deferred.reject('Not a valid response, expecting an array');
			}
		}, deferred.reject);
		return deferred.promise;
	};
	return ActiveRecord;
}]);
