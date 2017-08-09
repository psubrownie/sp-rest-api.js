/**
 * @fileoverview A libary for working with SharePoint lists via the SharePoint
 * REST API. Supports reading, updating and deleting list items, as well as a
 * few extra functions such as getting a list of all columns in a SP list.
 */

/**
 * Initializes a new instance of the SpRestApi class, which contains methods
 * for calling the SharePoint REST API.
 * @class SpRestApi
 * @typedef {Object} SpRestApi
 * @constructor
 * @param {SpRestApiOptions} [options] - The optional settings to override the
 *      defaults.
 */
var SpRestApi = function (options) {
    /**
     * The default options that will be used unless overridden.
     * @type {SpRestApiOptions}
     */
    this.defaultOptions = {
        onsuccess: console.log,
        onerror: console.log,
        listTitle: '',
        maxItems: 100,
        recursiveFetch: true,
        verbosity: SpRestApi.Verbosity.VERBOSE,
        siteUrl: _spPageContextInfo ? _spPageContextInfo.webAbsoluteUrl : '',
        token: document.getElementById("__REQUESTDIGEST") ? 
            document.getElementById("__REQUESTDIGEST").value : '',
        urls: {
            list: '/_api/web/lists/getbytitle(\'{0}\')/items',
            item: '/_api/web/lists/getbytitle(\'{0}\')/items({1})',
        },
    };

    this.options = $.extend(this.defaultOptions, options);
};

/**
 * Determines the amount of metadata in the response JSON from server.
 * For most cases, 'COMPACT' should be enough.
 * @readonly
 * @enum {string}
 * @typedef Verbosity
 */
SpRestApi.Verbosity = {
    /** Values are placed in `.value`. Less metadata. 
        Not supported in SP 2013 and earlier. */
    COMPACT: 'application/json;odata=nometadata',

    /** Value are placed in `.value`. Moderate metadata. 
        Not supported in SP 2013 and earlier. */
    MINIMAL: 'application/json;odata=minimalmetadata',

    /** Values are placed in `.d.results`. More metadata. */
    VERBOSE: 'application/json;odata=verbose',
};

/**
 * @typedef {Object} SpRestApiOptions - The options passed to methods
 *      inside the SpRestApi class.
 * @property {Array.<SpRestApiFilterCriterion>} filters - The filters to be
 *      used in filtering the list items using the $filter parameter.
 * @property {string} [token] - The SharePoint's request digest, a token that
 *      it is required for every API call. Required only if using outside a
 *      SharePoint page, otherwise it is obtained automatically from DOM.
 * @property {Function} [onsuccess] - The callback function for successful
 *      requests to SharePoint REST API.
 * @property {Function} [onerror] - The callback function for failed requests
 *      to SharePoint REST API.
 * @property {string} [listTitle] - The display name of the SharePoint list.
 * @property {number} [maxItems] - The maximum number of items to be returned
 *      from the list. If `recursiveFetch` is set to true, this is the
 *      maximum number of items to fetch on each request to server. If not
 *      not specified, defaults to SharePoint's limit of 100. Maximum is
 *      5000 due to SharePoint limitations.
 * @property {boolean} [recursiveFetch] - Fetch all items from the list by
 *      repeatedly making server requests until all list items are fetched.
 *      This is to overcome SharePoint's limitation of maximum 5000 items
 *      per call.
 * @property {string} [verbosity] - The amount of metadata to be returned
 *      in the JSON response from server. Use the SpRestApi.Verbosity enum.
 * @property {string} [siteUrl] - The SharePoint site URL which is usually
 *      obtained from the _spPageContextInfo.webAbsoluteUrl. Required if using
 *      this library outside of a SharePoint page.
 * @property {Array.<string>} [urls] - The URLs of various API calls, e.g. to
 *      get a list item, all items in a list etc.
 */
/**
 * Stores this instance's options.
 * @type {SpRestApiOptions}
 */
SpRestApi.prototype.options = {};

/**
 * Sets the list title (list display name) of this SpRestApi instance.
 * The .lists() must be called before any call to other list-related
 * methods.
 * @param {string} listTitle - The display name of the SharePoint list.
 * @returns {SpRestApi} Returns the instance of this SpRestApi object.
 */
SpRestApi.prototype.lists = function (listTitle) {
    this.options.listTitle = listTitle;
    return this;
};

/**
 * Sets the SpRestApiOptions. If not called, before the request to server,
 * the default options will be used.
 * @param {SpRestApiOptions} options - The partial SpRestApiOptions object,
 *      where each field will override a default setting in `.defaultOptions`.
 * @returns {SpRestApi} This SpRestApi instance.
 */
SpRestApi.prototype.config = function (options) {
    // Merge the specified options with the default options
    this.options = $.extend(this.defaultOptions, options);
    return this;
};

/**
 * Adds the $top= string to the specified URL, to limit the max number of
 * items in the response.
 * @param {string} url - the URL to add the $top string to.
 * @returns {string} The URL with the added "?"/"&" character and the $top=
 *      URL parameter.
 */
SpRestApi.prototype.addMaxItems = function (url) {
    // Add '?' or '&' to URL query string
    url += url.includes('?') ? '&' : '?';

    return url + "$top=" + this.options.maxItems;
};

/**
 * Returns all items from a list, or all items up to the SharePoint limit
 * or the limit specified in the options.
 */
SpRestApi.prototype.getAllItems = function () {
    var url = generateGetAllListItemsUrl();
    this.loadUrl(url, 'GET', this.options.onsuccess, this.options.onerror);
};

/**
 * Generates the URL for fetching all items from a list. Uses in getAllItems()
 * and in getAllItemsFromSubfolder().
 * @returns {string} The SP API URL for fetching all items from a list.
 */
SpRestApi.prototype.generateGetAllListItemsUrl = function () {
    var url = this.options.siteUrl +
        this.options.urls.list.format(this.options.listTitle);
    url = this.addMaxItems(url);
    return url;
};

/**
 * Returns all list items from a subfolder of a SharePoint list. Uses a hacky
 * way - by matching a substring of the FileRef, to avoid relying on CAML.
 * @param {string} subfolderName - The display name of the subfolder in a list.
 *      Must not include any slashes.
 */
SpRestApi.prototype.getAllItemsFromListSubfolder = function (subfolderName) {
    // The idea here is that if the FileRef property of a list item is
    // like this - /sites/mysite/Lists/My List/My Subfolder/123_.000 - 
    // then we can filter the list by FileRef containing the 
    // string 'Lists/My List/My Subfolder'.
    var fileref = 'Lists/' +
        this.options.listTitle + '/' + subfolderName + '/';

    var url = this.generateGetAllListItemsUrl();
    url += '&$filter=substringof(\'' + fileref + '\', FileRef)';

    this.loadUrl(url, 'GET', this.options.onsuccess, this.options.onerror);
};

/**
 * Returns a single item from a list.
 * @param {number} itemId - The SharePoint list item ID of the item we need to
 *      fetch.
 */
SpRestApi.prototype.getItem = function (itemId) {
    if (!itemId) { throw "The list item ID must not be empty."; }

    var url = this.options.siteUrl +
        this.options.urls.item.format(this.options.listTitle, itemId);
    this.loadUrl(url, 'GET', this.options.onsuccess, this.options.onerror);
};

/**
 * A generic function to call any URL of the SharePoint REST API. Usually
 * there is no need to call this method directly.
 * @param {string} url - The URL of the SharePoint REST API to be queried. Will
 *      not be modified by this method.
 * @param {string} method - HTTP method for this request, e.g. 'GET', 'POST',
 *      'DELETE'.
 * @param {Function} success - Callback for successfull REST API call.
 * @param {Function} error - Callback for failed REST API call.
 */
SpRestApi.prototype.loadUrl = function (url, method, success, error) {
    // Preserve `this` containing the current instance of SpRestApi.
    var $ajax = $.proxy($.ajax, this);

    $ajax({
        url: url,
        type: method,
        cache: false,
        contentType: this.options.verbosity,
        headers: {
            "Accept": this.options.verbosity,
            "X-RequestDigest": this.options.token,
        },
        success: function (data) {
            success(data);
        },
        error: function (data) {
            error(data);
        },
    });
};

/**
 * Sends a request to SharePoint to get the SharePoint authorization token,
 * which is required for all data requests. This is necessary in two cases:
 * - We are loading this script from a non-SharePoint page (e.g. normal HTML);
 * - We are refreshing the token (which expires after 30 minutes).
 * @param {Function} callback - The callback to run after the authorization
 *      token is received successfully.
 */
SpRestApi.prototype.refreshDigest = function (callback) {
    var url = this.siteUrl + '/_api/contextinfo';

    // If request succeeded:
    var success = function (data) {
        if (data && data.d && data.d.GetContextWebInformation &&
            data.d.GetContextWebInformation.FormDigestValue) {
            // If Verbosity = odata=verbose:
            this.options = data.d.GetContextWebInformation.FormDigestValue;

        } else if (data && data.value && data.value.GetContextWebInformation &&
            data.value.GetContextWebInformation.FormDigestValue) { // TODO FIXME need to verify this path is correct in SP online
            // If Verbosity = odata=nometadata, odata=minimalmetadata:
            this.options = data.value.GetContextWebInformation.FormDigestValue;
        } else {
            throw 'Unable to obtain SharePoint authorization token.';
        }

        if (typeof callback === 'function') {
            callback();
        }
    };

    // If request failed:
    var error = function () {
        throw 'Unable to obtain SharePoint authorization token';
    };

    this.loadUrl(url, 'POST', success, error);
};


/* Polyfills
-----------------------------*/

if (!String.prototype.format) {
    /**
    * Replaces symbols like {0}, {1} in a string with the values from
    * the arguments.
    * @returns {string} The string with the replaced placeholders.
    */
    String.prototype.format = function () {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] !== 'undefined'
                ? args[number]
                : match
                ;
        });
    };
}

if (!String.prototype.includes) {
    String.prototype.includes = function (search, start) {
        'use strict';
        if (typeof start !== 'number') {
            start = 0;
        }

        if (start + search.length > this.length) {
            return false;
        } else {
            return this.indexOf(search, start) !== -1;
        }
    };
}