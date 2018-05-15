import _ from 'lodash';
import QueryBuilder, { QUERY_AWAIT_SINGLE } from './QueryBuilder';
import { REST_CONFIG } from './config';
import { Exception, InvalidUrlException, UnimplementedException, UnreachableServerException } from 'bunch-of-exceptions';
import ResponseHandler from './ResponseHandler';

export default class Model {
    constructor() {
        this.queryBuilder = new QueryBuilder();
        this.selfValidate();
        this.type = this.getNamespace();


        this.owner = null;

        this.fields = this.getFields();
        this.relations = this.getRelations();
        this.dates = this.getDates();
        this.namespace = this.getNamespace();
    }

    // override

    getFields() {
        throw UnimplementedException("Method getFields() must be implemented in every child class.");
    }

    getDates() {
        return {};
    }

    getRelations() {
        return {};
    }

    computed() {
        return {};
    }

    getNamespace() {
        throw UnimplementedException("Method getNamespace() must be implemented in every child class.");
    }

    getBaseUrl() {
        return REST_CONFIG.base_url;
    }

    /**
     * Make changes or use fetch config before the request
     * @param fetchConfig the config
     * @returns the changed fetch config
     */
    beforeFetch(fetchConfig) {
        return fetchConfig;
    }

    /**
     * Make changes or use fetch response before the jsoning
     * @param fetchResponse the fetch response
     * @returns the changed response
     */
    afterFetch(fetchResponse) {
        return fetchResponse;
    }

    toJson() {
        const json = {};

        const fields = this.getFields();
        const relations = this.getRelations();
        const relationsName = Object.keys(relations);
        const dates = this.getDates();
        const datesName = Object.keys(dates);

        for (const prop in this) {
            if (fields.includes(prop)) {
                json[prop] = this[prop];
            }
            else if (datesName.includes(prop)) {
                json[prop] = this[prop].toString();
                if (json[prop].includes('T')) {
                    json[prop] = json[prop].replace('T', ' ').replace('Z', '');
                }
            }
            else if (relationsName.includes(prop)) {
                if (relations[prop].list) {
                    json[prop] = this[prop].map((one) => one.toJson());
                }
                else {
                    json[prop] = this[prop].toJson();
                }
            }
        }

        return json;
    }


    /**
     * Force Lazy loading of a relation to the model and returns the loaded relation
     * @param {string} relation the relation to load and to retrieve
     * @returns {Promise<*>} the loaded relation
     */
    async forceLazyLoadAndGet(relation) {
        await this.forceLazyLoad(relation);
        return this[relation];
    }

    /**
     * Lazy loads a relation to the model and returns the loaded relation
     * @param {string} relation the relation to load and to retrieve
     * @returns {Promise<*>} the loaded relation
     */
    async lazyLoadAndGet(relation) {
        await this.lazyLoad(relation);
        return this[relation];
    }

    /**
     * Lazy loads relations to the model.
     * Does not load already loaded relations.
     * To force the load, use Model#forceLazyLoad() method
     *
     * @param {...string} relations a list of relations to load. The function doesn't reload an already loaded relation.
     * @returns {Promise<*>} formatted loaded relation if single, otherwise returns this.
     */
    async lazyLoad(...relations) {
        relations = this.filterLoadedRelations(...relations);
        return this.forceLazyLoad(...relations);
    }

    /**
     * Lazy loads relations to the model.
     * This function FORCE all relations to be loaded, even the already loaded ones.
     * To avoid the force reload, use Model#lazyLoad() method
     *
     * @param {...string} relations a list of relations to load.
     * @returns {Promise<*>} this.
     */
    async forceLazyLoad(...relations) {
        if (relations.length > 0) {
            try {
                const newThis = await new this.constructor().with(...relations).find(this.id);
                for (const r of relations) {
                    this[r] = newThis[r];
                    this.relations[r].loaded = true;
                }
            } catch (e) {
                console.error(`Lazy loading error. Relation '${relations.join("', '")}' of '${this.constructor.name}':`);
                console.error(e);
                for (const r of relations) {
                    this.relations[r] = [];
                }
            }
        }

        return this;
    }

    /**
     * Filter the relations that have already been loaded.
     * @param {string} relations the model's relations
     * @returns {array} the filtered relations (that haven't been loaded yet)
     */
    filterLoadedRelations(...relations) {
        const arr = [];
        for (const r of relations) {
            if (!this.relations[r].loaded) {
                arr.push(r);
            }
        }

        return arr;
    }

    // requests

    async request(config) {
        let opt = { method: config.method };

        this.queryBuilder.reset();

        if (config.data && !_.isEmpty(config.data)) {
            opt.data = config.data;
        }

        opt = this.beforeFetch(opt);

        try {
            let response = await fetch(config.url, opt);

            if (!response.ok) {
                if (response.status >= 500) {
                    throw new UnreachableServerException(`The server returned HTTP code ${response.status} (${response.statusText})`);
                }

                if (response.status >= 400) {
                    throw new InvalidUrlException(`The server returned HTTP code ${response.status} (${response.statusText})`);
                }

                throw new Exception(`Fetch failed with response: ${response.statusText}`);
            }

            response = this.afterFetch(response);

            return (await response.json());
        }
        catch (e) {
            throw new Exception("Fetch failed");
        }
    }

    _getUrlFunctionOfId(id){
        if (id) {
            return this.queryBuilder.buildUrl(this.namespace, id);
        } else {
            const snakeCase = this.constructor.name
                                  .replace(/([A-Z]+)/g, (x, y) => "_" + y.toLowerCase())
                                  .replace(/^_/, "");

            return this.queryBuilder.buildUrl(snakeCase);
        }
    }

    async find(id) {
        this.queryBuilder.awaitType = QUERY_AWAIT_SINGLE;

        let url = this._getUrlFunctionOfId(id);

        let response = await this.request({
            url,
            method: REST_CONFIG.http_methods.get,
        });

        return this.respond(response.data);
    }

    async all() {
        let response = await this.request({
            url: this.queryBuilder.buildUrl(this.namespace),
            method: REST_CONFIG.http_methods.get,
        });

        return this.respond(response.data);
    }

    async paginate(perPage = 10, page = 1) {
        this.queryBuilder.paginate(perPage, page);

        let response = await this.request({
            url: this.queryBuilder.buildUrl(this.namespace),
            method: REST_CONFIG.http_methods.get,
        });

        return this.respond(response.data);
    }

    async save() {
        this.queryBuilder.awaitType = QUERY_AWAIT_SINGLE;
        if (this.hasOwnProperty('id')) {
            return this.update();
        }

        return this.create();
    }

    async create() {
        this.queryBuilder.awaitType = QUERY_AWAIT_SINGLE;
        let response = await this.request({
            url: this.queryBuilder.buildUrl(this.namespace),
            method: REST_CONFIG.http_methods.create,
            data: this.toJson(),
        });

        return this.respond(response.data);
    }

    async update() {
        this.queryBuilder.awaitType = QUERY_AWAIT_SINGLE;

        let response = await this.request({
            url: this.queryBuilder.buildUrl(this.namespace, this.id),
            method: REST_CONFIG.http_methods.update,
            data: this.toJson(),
        });

        return this.respond(response.data);
    }

    async delete() {
        this.queryBuilder.awaitType = QUERY_AWAIT_SINGLE;
        let response = this.request({
            url: this.queryBuilder.buildUrl(this.namespace, this.id),
            method: REST_CONFIG.http_methods.delete,
        });

        return this.respond(response.data);
    }

    async attach(model, data = null, sync = false) {
        this.queryBuilder.awaitType = QUERY_AWAIT_SINGLE;

        this.relationOfModel(this);
        if (sync) {
            this.queryBuilder.addCustomParameter(REST_CONFIG.request_keywords.sync, 'true');
        }

        let queryConfig = {
            url: this.queryBuilder.buildUrl(model.namespace, model.id),
            method: sync ? REST_CONFIG.http_methods.update : REST_CONFIG.http_methods.create,
        };

        if (data) {
            queryConfig.data = data;
        }

        let response = await this.request(queryConfig);

        return this.respond(response.data);
    }

    async detach(model) {
        this.queryBuilder.awaitType = QUERY_AWAIT_SINGLE;

        this.relationOfModel(this);

        let response = await this.request({
            url: this.queryBuilder.buildUrl(model.namespace, model.id),
            method: REST_CONFIG.http_methods.delete,
        });

        return this.respond(response.data);
    }

    async sync(model, data) {
        this.queryBuilder.awaitType = QUERY_AWAIT_SINGLE;
        return this.attach(model, data, true);
    }

    // modify url string

    /**
     * Load model with some relations
     * @param {string} relation the name of the relation
     * @returns {Model} this
     */
    with(...relation) {
        this.queryBuilder.with(...relation);

        return this;
    }

    /**
     * Load as a relation of another model <br/>
     * @note See Model#relationOf if you want to use the namespace and the id
     * @param {Model} model the owner
     * @return {Model} this
     */
    relationOfModel(model) {
        return this.relationOf(model.constructor, model.id);
    }

    /**
     * @note See Model#relationOfModel if you have an instance of a Model
     * @param {constructor} constructor the url constructor of the owner. <br/>
     * @example If the url should be'.../api/users/2/posts' => constructor is 'users'
     * @param id the owner's id
     * @return {Model} this
     */
    relationOf(constructor, id) {
        if (constructor instanceof Model) {
            constructor = constructor.constructor;
        }

        this.owner = {
            constructor,
            id,
        };

        this.queryBuilder.relationOf(new constructor().namespace, id);

        return this;
    }


    /**
     * @note See Model#relationOfModel if you have an instance of a Model
     * @param {constructor} constructor the url namespace of the owner. <br/>
     * @example If the url should be'.../api/users/2/posts' => namespace is 'users'
     * @param id the owner's id
     * @return {Model} this
     */
    of(constructor, id) {
        return this.relationOf(constructor, id);
    }


    /**
     * Load as a relation of another model <br/>
     * @note See Model#relationOf if you want to use the namespace and the id
     * @param {Model} model the owner
     * @return {Model} this
     */
    ofModel(model) {
        return this.relationOfModel(model);
    }


    /**
     * Order by a list of fields
     * @param fields the field string, ASC by default. add a '-' ahead to sort in DESC order.
     * EX: model.orderBy('age', '-name') will order by age ASC, and by name DESC
     * @returns {Model} this
     */
    orderBy(...fields) {
        for (const field of fields) {
            let direction = 'ASC';
            let column = field;
            if (column[0] === '-') {
                direction = 'DESC';
                column = field.substr(1);
            }

            this.queryBuilder.orderBy(column, direction);
        }

        return this;
    }

    limit(limit, offset) {
        this.queryBuilder.limit(limit, offset);

        return this;
    }

    orderByDesc(column) {
        return this.orderBy('-' + column);
    }

    where(key, operator, value = null) {
        this.queryBuilder.where(key, operator, value);

        return this;
    }

    from(date) {
        this.queryBuilder(date);

        return this;
    }

    to(date) {
        this.queryBuilder.to(date);

        return this;
    }

    select(...fields) {
        this.queryBuilder.select(...fields);

        return this;
    }

    distinct(bool = true) {
        this.queryBuilder.distinct(bool);

        return this;
    }

    // build model

    /**
     * Make changes to the received json before the parsing
     * @param json the json received
     * @returns the computed json
     */
    computeJsonBeforeParsing(json) {
        return json;
    }

    respond(json) {
        json = this.computeJsonBeforeParsing(json);
        return ResponseHandler.ofJson(this, json);
    }

    // lib

    resourceUrl() {
        return `${this.getBaseUrl()}/${this.getNamespace()}/`;
    }

    isCollection(data) {
        return _.isArray(data.data);
    }

    selfValidate() {
        const name = this.getNamespace();

        if (name === null || !_.isString(name) || name.length === 0) {
            throw new Error(`LRA Query Builder: Resource name not defined in ${this.constructor.name} model. Implement resourceName method in the ${this.constructor.name} model to resolve this error.`);
        }
    }
}
