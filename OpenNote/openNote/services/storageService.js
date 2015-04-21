/**
 * @author - Jake Liscom 
 * @project - OpenNote
 */

/**
 * Storage service
 */
openNote.service("storageService", function ($rootScope) {	
	
	var localDatabase = null;
	var remoteDatabase = null;
	var replicationTimeout = null;
	
	/**
	 * Initialize the PouchDB database and create indexes
	 */
	this.init = function(){
		//Create or find database
			localDatabase = new PouchDB("openNote");
		
		//Indexes
			// create a design doc
				var parentFolderDesignDoc = {
					_id: "_design/folder",
					views: {
						parentFolderID: {
							map: function (doc) {
							  emit(doc.parentFolderID);
							}.toString()
						}
					}
				};
		
			// save the design doc
				localDatabase.put(parentFolderDesignDoc).catch(function (err) {
					if (err.status !== 409) {
						throw err;
					}
					// ignore if doc already exists
				});
				
		//Re-init sync		
			var url = localStorage.getItem("remoteURL");
			if(url){
				remoteDatabase = new PouchDB(url);
				this.setupSync();
			};
	};
	
	/**
	 * @param url - The remote URL to use in replication
	 */
	this.setRemoteURL = function(url){
		localStorage.setItem("remoteURL",url);
		remoteDatabase = new PouchDB(url);
	};
	
	/**
	 * @return - The remote URL to use in replication
	 */
	this.getRemoteURL = function(url){
		return localStorage.getItem("remoteURL");
	};
	
	/**
	 * Get the local database
	 */
	this.database = function(){
		return localDatabase;
	};
	
	/**
	 * Get the remote database
	 */
	this.remoteDatabase = function(){
		return remoteDatabase;
	};
	
	/**
	 * Setup live sync
	 */
	this.setupSync = function(){
		localDatabase.sync(remoteDatabase,{live: true, retry: true}).on("complete", function (info) {
			alertify.success("Replication complete");
		}).on("error", function (err) {
			alertify.error("Replication error");
		}).on("paused", function () {
			if(!replicationTimeout)
				replicationTimeout = setTimeout(function(){
					alertify.log("Replication complete");
					replicationTimeout = null;
					
					$rootScope.$emit("replicationComplete", {});
					$rootScope.$apply()
				}, 1000);
		});
	};
	
	/**
	 * Load a folders contents
	 * @param folderID - the folder id to load the content folder
	 * @param callback - query callback handler
	 */
	this.loadFolderContents = function(folderID, callback){
		localDatabase.query("folder/parentFolderID", {key: folderID, include_docs: true}).then(callback);
	};
	
	/**
	 * Delete the database
	 */
	this.destroyDatabase = function(callback){
		var self = this;
		localDatabase.destroy().then(function(){
			localStorage.removeItem("remoteURL")
			self.init();
			callback();
		});
	};
	
	/**
	 * Dump database to a file
	 * @param callback - callback where data is returned to
	 */
	this.databaseToFile = function(callback){
		localDatabase.allDocs({
		  include_docs: true
		}).then(function (result) {
			callback("data:application/octet-stream;charset=utf8," + encodeURIComponent(JSON.stringify({ data:result.rows})));
		});
	};
	
	/**
	 * Find an clean the orphans
	 * That is delete docs whose parent id is not null and does not exist in the database
	 */
	this.cleanOrphans = function(){
		
		/**
		 * the results doc
		 * @param result - the result object as returned by allDocs
		 */
		var orphanHunter = function(result){
			if(!result.doc.parentFolderID)//nulls are root and cannot be orphans
				return;
			
			localDatabase.get(result.doc.parentFolderID).catch(function(err){
				if(err.status=404)
					localDatabase.remove(result.doc);
				else
					throw err
			});
		};
		
		localDatabase.allDocs({
		  include_docs: true
		}).then(function (result) {
			result.rows.forEach(orphanHunter);
		});
	};
	
	/**
	 * Search folder names
	 * @param searchString - the search string to use
	 * @param callback - the callback to return the data to
	 */
	this.searchFolderNames = function(searchString, callback){
		localDatabase.query(function (doc, emit) {
			emit(doc.name);
		}, {key: searchString, include_docs: true}).then(function (results) {
			callback(results.filter(this.folderFilter));
		});
	};
	
	/**
	 * Search note titles
	 * @param searchString - the search string to use
	 * @param callback - the callback to return the data to
	 */
	this.searchNoteTitles = function(searchString, callback){
		localDatabase.query(function (doc, emit) {
			emit(doc.title);
		}, {key: searchString, include_docs: true}).then(function (results) {
			callback(results.filter(this.noteFilter));
		});
	};
	
	/**
	 * Search note body
	 * @param searchString - the search string to use
	 * @param callback - the callback to return the data to
	 */
	this.searchNoteBody = function(searchString, callback){
		localDatabase.query(function (doc, emit) {
			emit(doc.note);
		}, {key: searchString, include_docs: true}).then(function (results) {
			callback(results.filter(this.noteFilter));
		});
	};
	
	/**
	 * Filter out everything but a given type
	 * @param object - the object to filter
	 * @param type - the type to filter in
	 */
	this.typeFilter = function(object,type){
		return object.doc.type==type;
	};
	
	/**
	 * Filter out everything but type folder
	 */
	this.folderFilter=function(object){
		return this.typeFilter(object,"folder");
	};
	
	/**
	 * Filter out everything but type note
	 */
	this.noteFilter=function(object){
		return this.typeFilter(object,"note");
	};
	
	//First time create database
		this.init();
});