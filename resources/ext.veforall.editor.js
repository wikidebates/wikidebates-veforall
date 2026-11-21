/*
 * VEForAll Editor class.
 *
 * @author Pierre Boutet
 * @author Yaron Koren
 */

( function ( $, mw, OO, ve ) {
	'use strict';

	/**
	 * This launches the VisualEditor on a given textarea.
	 *
	 * Usage:
	 *   new mw.veForAll.Editor(node, initialContent);
	 * where:
	 * - node is the HTML element of the textarea
	 * - initialContent is the text content (wikitext format)
	 *
	 */

	/**
	 * @class
	 * @constructor
	 * @param {jQuery} $node Node to replace with a VisualEditor
	 * @param {string} [content='']
	 */
	mw.veForAll.Editor = function ( $node, content ) {
		var modules;

		// mixin constructor
		OO.EventEmitter.call( this );

		// node the editor is associated with.
		this.$node = $( $node );
		// Disabling the textarea during first conversion normally drops focus.
		this.focusOnReady = document.activeElement === this.$node[ 0 ];

		// @hack: make textarea look pending in case we didn't come from an editor switch.
		// Once this is an OO.ui.TextInputWidget we'll be able to use real PendingElement
		// functionality for this.
		this.$node
			.prop( 'disabled', true )
			.addClass( 'oo-ui-texture-pending' );

		// The main module should already be loaded.
		modules = mw.config.get( 'wgVisualEditorConfig' ).pluginModules.filter( mw.loader.getState );

		// Keep a completion promise so Page Forms can wait before serializing.
		this.readyPromise = new Promise( ( resolve, reject ) => {
			this._resolveReady = resolve;
			this._rejectReady = reject;
		} );
		// Consumers outside Page Forms may not await the promise.
		this.readyPromise.catch( () => {} );
		Promise.resolve( mw.loader.using( modules ) )
			.then( () => this.init( content || '' ) )
			.catch( ( error ) => {
				this.$node.removeData( 'veForAllInitializing' ).prop( 'disabled', false )
					.removeClass( 'oo-ui-texture-pending' );
				this._rejectReady( error );
			} );
	};

	OO.mixinClass( mw.veForAll.Editor, OO.EventEmitter );

	/**
	 * List of callbacks to execute when VE is fully loaded
	 */
	mw.veForAll.Editor.prototype.initCallbacks = [];

	mw.veForAll.Editor.prototype.createTarget = function () {
		var self = this, $wrapperNode, maxHeight;

		if ( $( this.$node ).hasClass( 'toolbarOnTop' ) ) {
			this.target = new mw.veForAll.Targetwide( this.$node, $( this.$node ).val() );
		} else {
			this.target = new mw.veForAll.Target( this.$node, $( this.$node ).val() );
		}

		// Signal initial Parsoid failures to the caller waiting for readiness.
		self.target.on( 'editor-error', function () {
			self._rejectReady( new Error( 'VisualEditor initial conversion failed' ) );
		} );

		// Various tasks to do once VE has finished being applied.
		self.target.on( 'editor-ready', function () {
			// Catch keyup events on surface to comply with
			// saveAndContinue button state and changes warning.
			self.target.getSurface().getView().on( 'keyup', function () {
				self.$node.trigger( 'change' );
			} );

			// Catch keyup events on raw textarea to use changes
			// warning on page reload.
			self.target.$node.on( 'keyup', function () {
				self.$node.trigger( 'change' );
			} );

			// Set max height of the textarea, if it was specified.
			$wrapperNode = self.$node.parent( '.ve-area-wrapper' );
			maxHeight = $wrapperNode.attr( 'data-max-height' );
			if ( maxHeight !== undefined ) {
				$wrapperNode.find( '.ve-ce-documentNode' ).css( 'max-height', maxHeight )
					.css( 'overflow-y', 'auto' );
			}

			self.$node.removeData( 'veForAllInitializing' );
			if ( self.focusOnReady && document.activeElement === document.body ) {
				self.target.getSurface().getView().focus();
			}
			self._resolveReady();
			mw.hook( 'veForAll.targetCreated' ).fire( this );
		} );

		return this.target;
	};

	/**
	 * Callback function, executed after all VE dependencies have been loaded.
	 *
	 * @param {string} [content='']
	 */
	mw.veForAll.Editor.prototype.init = function ( content ) {
		this.target = this.createTarget();

		$.each( this.initCallbacks, function ( k, callback ) {
			callback.apply( this );
		}.bind( this ) );
	};

	mw.veForAll.Editor.prototype.destroy = function () {
		if ( this.target ) {
			this.target.destroy();
		}

		// re-display original node
		this.$node.show();
	};

	/**
	 * Gets HTML of Flow field
	 *
	 * @return {string}
	 */
	mw.veForAll.Editor.prototype.getRawContent = function () {
		var doc, html;

		// If we haven't fully loaded yet, just return nothing.
		if ( !this.target ) {
			return '';
		}

		// get document from ve
		doc = ve.dm.converter.getDomFromModel( this.dmDoc );

		// document content will include html, head & body nodes; get only content inside body node
		html = ve.properInnerHtml( $( doc.documentElement ).find( 'body' )[ 0 ] );
		return html;
	};

	/**
	 * Checks if the document is empty
	 *
	 * @return {boolean} True if and only if it's empty
	 */
	mw.veForAll.Editor.prototype.isEmpty = function () {
		if ( !this.dmDoc ) {
			return true;
		}

		// Per Roan
		return this.dmDoc.data.countNonInternalElements() <= 2;
	};

	mw.veForAll.Editor.prototype.focus = function () {
		if ( !this.target ) {
			this.initCallbacks.push( function () {
				this.focus();
			} );
			return;
		}

		this.target.surface.getView().focus();
	};

	mw.veForAll.Editor.prototype.moveCursorToEnd = function () {
		var data, cursorPos;

		if ( !this.target ) {
			this.initCallbacks.push( function () {
				this.moveCursorToEnd();
			} );
			return;
		}

		data = this.target.surface.getModel().getDocument().data;
		cursorPos = data.getNearestContentOffset( data.getLength(), -1 );

		this.target.surface.getModel().setSelection( new ve.Range( cursorPos ) );
	};

	// Static fields

	/**
	 * Type of content to use
	 *
	 * @member {string}
	 */
	mw.veForAll.Editor.static.format = 'html';

	/**
	 * Name of this editor
	 *
	 * @member string
	 */
	mw.veForAll.Editor.static.name = 'visualeditor';

	// Static methods

	mw.veForAll.Editor.static.isSupported = function () {
		var isMobileTarget = ( mw.config.get( 'skin' ) === 'minerva' );

		/* global VisualEditorSupportCheck */
		return !!(
			!isMobileTarget &&
			mw.loader.getState( 'ext.visualEditor.core' ) &&
			mw.config.get( 'wgFlowEditorList' ).indexOf( 'visualeditor' ) !== -1 &&
			window.VisualEditorSupportCheck && VisualEditorSupportCheck
		);
	};

}( jQuery, mediaWiki, OO, ve ) );
