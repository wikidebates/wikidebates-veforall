/* globals mediaWiki, OO, ve */

( function ( mw, OO, ve ) {
	'use strict';

	mw.veForAll = mw.veForAll || {
		ui: {}
	};

	/**
	 * Inherits from the standard VE target.
	 *
	 * @param node
	 * @param content
	 * @class
	 * @extends ve.init.mw.Target
	 */
	mw.veForAll.Target = function ( node, content ) {
		var config = {};
		config.toolbarConfig = {};
		config.toolbarConfig.actions = true;
		// disable floatable behavior.
		config.toolbarConfig.floatable = false;

		this.$node = node;
		this.pendingUpdatePromise = null;
		this.contentRevision = 0;

		this.toolbarAutoHide = true;
		this.toolbarPosition = 'bottom';

		if ( node.hasClass( 'toolbarOnTop' ) ) {
			this.toolbarPosition = 'top';
			this.toolbarAutoHide = false;
			config.toolbarConfig.floatable = false;
		}

		// OOUI uses its own position setting to decide which way popup
		// toolgroups open. Match that to the actual toolbar DOM placement:
		// below the editor by default, above it with toolbarOnTop.
		config.toolbarConfig.position = this.toolbarPosition;

		mw.veForAll.Target.parent.call( this, config );

		// HACK: stop VE's education popups from appearing (T116643)
		this.dummyToolbar = true;

		this.init( content );
	};

	OO.inheritClass( mw.veForAll.Target, ve.init.mw.Target );

	mw.veForAll.Target.prototype.init = function ( content ) {
		this.initializationPromise = this.convertToHtml( content );
	};

	// Static

	mw.veForAll.Target.static.name = 'veForAll';

	mw.veForAll.Target.static.toolbarGroups = ( function () {
		var toolbarConfig = JSON.parse( JSON.stringify( mw.config.get( 'VEForAllToolbarNormal' ) ) );
		return toolbarConfig.map( function ( x, index ) {
			// VisualEditor requires a stable name for every toolbar group.
			// Preserve names provided by VEForAllToolbarConfigNormal hooks.
			if ( !x.name ) {
				x.name = 'veforall-normal-' + index;
			}
			if ( 'header' in x ) {
				x.header = OO.ui.deferMsg( x.header );
			}
			if ( 'title' in x ) {
				x.title = OO.ui.deferMsg( x.title );
			}
			return x;
		} );
	}() );

	mw.veForAll.Target.static.actionGroups = [
		{ name: 'veforall-switch-editor', include: [ 've4aSwitchEditor' ] }
	];

	// Allow pasting links
	mw.veForAll.Target.static.importRules = ve.copy( mw.veForAll.Target.static.importRules );
	mw.veForAll.Target.static.importRules.external.blacklist = OO.simpleArrayDifference(
		mw.veForAll.Target.static.importRules.external.blacklist,
		[ 'link/mwExternal' ]
	);

	// Static methods
	mw.veForAll.Target.static.setSwitchable = function ( switchable ) {
		// FIXME this isn't supposed to be a global state thing, it's supposed to be
		// variable per EditorWidget instance

		if ( switchable ) {
			mw.veForAll.Target.static.actionGroups = [ {
				name: 'veforall-edit-mode',
				type: 'list',
				icon: 'edit',
				title: mw.msg( 'visualeditor-mweditmode-tooltip' ),
				include: [ 'editModeVisual', 'editModeSource' ]
			} ];
		} else {
			mw.veForAll.Target.static.actionGroups = [];
		}
	};

	/**
	 * Add listener to show or hide toolbar if the area gets or loses focus.
	 */
	mw.veForAll.Target.prototype.setPulloutToolbar = function () {
		var target = this;
		this.getSurface().getView().on( 'blur', function () {
			target.updateToolbarVisibility();
		} );
		this.getSurface().getView().on( 'focus', function () {
			target.updateToolbarVisibility();
		} );
		this.updateToolbarVisibility();
	};

	/**
	 * Hide toolbar if area not focused (VE area or textarea ).
	 */
	mw.veForAll.Target.prototype.updateToolbarVisibility = function () {
		if ( !this.toolbarAutoHide ) {
			return;
		}
		if ( $( this.$node ).closest( '.ve-area-wrapper' ).find( ':focus' ).length > 0 ) {
			this.getToolbar().$element.show( 100 );
		} else {
			this.getToolbar().$element.hide( 100 );
		}
	};

	/**
	 * OOUI clips dropdowns to the closest scrolling ancestor. On Minerva,
	 * VEForAll's horizontally scrollable toolbar row is too short to be a
	 * vertical clipping boundary for popup menus. Override this lookup only
	 * for the popup groups belonging to the current VEForAll target.
	 */
	mw.veForAll.Target.prototype.fixMinervaToolbarMenuClipping = function () {
		if ( !document.body.classList.contains( 'skin-minerva' ) ||
			!this.$node.closest( '.ve-area-wrapper' ).length
		) {
			return;
		}

		var toolbar = this.getToolbar();

		function useViewportClipping( group ) {
			if ( !group ||
				typeof group.getClosestScrollableElementContainer !== 'function' ||
				typeof group.toggleClipping !== 'function'
			) {
				return;
			}

			group.getClosestScrollableElementContainer = function () {
				return this.getElementDocument().documentElement;
			};

			// Recalculate a menu which is already open, if any.
			if ( group.isActive && group.isActive() ) {
				group.toggleClipping( false );
				group.toggleClipping( true );
			}
		}

		( toolbar.items || [] ).forEach( function ( group ) {
			useViewportClipping( group );

			// Style is a ToolGroupTool with its own nested popup group.
			Object.keys( group.tools || {} ).forEach( function ( name ) {
				var tool = group.tools[ name ];

				if ( tool && tool.innerToolGroup ) {
					useViewportClipping( tool.innerToolGroup );
				}
			} );
		} );
	};

	/**
	 * Create a new surface with VisualEditor, and add it to the target.
	 *
	 * @param {string} content text to initiate content, in html format
	 */
	mw.veForAll.Target.prototype.createWithHtmlContent = function ( content ) {
		var target = this,
			$focusedElement = $( ':focus' );

		this.addSurface(
			ve.dm.converter.getModelFromDom(
				ve.createDocumentFromHtml( content )
			)
		);
		// this.setSurface( surface );
		// this.$element.insertAfter( this.$node );

		// Append the target to the document
		$( this.$node ).before( this.$element );

		$( this.$node ).hide()
			.removeClass( 'oo-ui-texture-pending' ).prop( 'disabled', false );

		$( this.$node ).data( 'veForAllTarget', this );
		const surfaceModel = this.getSurface().getModel();
		const docModel = surfaceModel.getDocument();

		docModel.on( 'transact', function () {
			target.contentRevision++;
			target.$node.addClass( 've-for-all-waiting-for-update' );
		} );

		this.getSurface().getView().on( 'blur', function () {
			target.updateContent();
		} );

		this.getSurface().on( 'switchEditor', function () {
			target.switchEditor();
		} );

		// show or hide toolbar when lose focus
		this.getSurface().getView().on( 'focus', function () {
			target.updateToolbarVisibility();
		} );
		target.updateToolbarVisibility();
		this.setDir();
		// focus VE instance if textarea had focus
		if ( $focusedElement.length && this.$node.is( $focusedElement ) ) {
			this.getSurface().getView().focus();
		}

		// fix BUG on initialisation of toolbar position :
		target.getToolbar().onWindowResize();
		target.onToolbarResize();
		target.onContainerScroll();
		target.fixMinervaToolbarMenuClipping();

		// emit ready-state event
		target.emit( 'editor-ready' );
	};

	/**
	 * Update the original textarea value with the content of VisualEditor
	 * surface (convert the content into wikitext)
	 *
	 * @return {Promise}
	 */
	mw.veForAll.Target.prototype.updateContent = function () {
		var target = this,
			surface = this.getSurface(),
			resolved = $.Deferred().resolve().promise();

		if ( this.pendingUpdatePromise ) {
			return this.pendingUpdatePromise;
		}
		if ( surface === null || this.$node.is( ':visible' ) ||
			!this.$node.hasClass( 've-for-all-waiting-for-update' )
		) {
			return resolved;
		}

		function convertLatestRevision() {
			var revision = target.contentRevision;

			// An older conversion must never overwrite newer edits.
			return target.convertToWikiText( surface.getHtml(), function () {
				return revision === target.contentRevision;
			} ).then( function () {
				if ( revision !== target.contentRevision ) {
					// Do not resolve a save until the newest revision is serialized.
					return convertLatestRevision();
				}
				target.$node.removeClass( 've-for-all-waiting-for-update' );
			} );
		}

		this.pendingUpdatePromise = convertLatestRevision();
		this.pendingUpdatePromise.always( function () {
			target.pendingUpdatePromise = null;
		} );
		return this.pendingUpdatePromise;
	};

	mw.veForAll.Target.prototype.getPageName = function () {
		if ( mw.config.get( 'wgPageFormsTargetName' ) ) {
			return mw.config.get( 'wgPageFormsTargetName' );
		} else {
			return mw.config.get( 'wgPageName' );
		}
	};

	mw.veForAll.Target.prototype.escapePipesInTables = function ( text ) {
		var lines = text.split( '\n' ),
			tableDepth = 0,
			i, line;

		// Table syntax needs escaped separators inside template fields. Leave
		// nested template arguments and wikilink labels alone: their pipes
		// already belong to the nested construct, not to the table.
		function escapeTableDelimiters( value ) {
			var escaped = '',
				templateDepth = 0,
				linkDepth = 0,
				offset = 0,
				pair;

			while ( offset < value.length ) {
				pair = value.slice( offset, offset + 2 );
				if ( pair === '{{' ) {
					templateDepth++;
				} else if ( pair === '}}' && templateDepth > 0 ) {
					templateDepth--;
				} else if ( pair === '[[' ) {
					linkDepth++;
				} else if ( pair === ']]' && linkDepth > 0 ) {
					linkDepth--;
				} else {
					escaped += value.charAt( offset ) === '|' &&
						templateDepth === 0 && linkDepth === 0 ?
						'{{!}}' : value.charAt( offset );
					offset++;
					continue;
				}
				escaped += pair;
				offset += 2;
			}
			return escaped;
		}

		for ( i = 0; i < lines.length; i++ ) {
			line = lines[ i ];
			if ( line.indexOf( '{|' ) === 0 || line.indexOf( '{{{!}}' ) === 0 ) {
				tableDepth++;
				lines[ i ] = escapeTableDelimiters( line );
			} else if ( tableDepth > 0 &&
				( line.indexOf( '|}' ) === 0 || line.indexOf( '{{!}}}' ) === 0 )
			) {
				// The closing delimiter must be escaped too; for nested
				// tables, closing the inner one must not end the outer table.
				lines[ i ] = escapeTableDelimiters( line );
				tableDepth--;
			} else if ( tableDepth > 0 &&
				( line.charAt( 0 ) === '|' || line.charAt( 0 ) === '!' ||
					line.indexOf( '{{!}}' ) === 0 )
			) {
				// A single pass preserves escaped captions, span attributes
				// and later cell separators on the same line.
				lines[ i ] = escapeTableDelimiters( line );
			}
		}
		return lines.join( '\n' );
	};
	mw.veForAll.Target.prototype.convertToWikiText = function ( content, shouldApply ) {
		var target = this;

		this.$node.addClass( 'oo-ui-texture-pending' );
		this.$element.addClass( 'oo-ui-texture-pending' );

		return new mw.Api().post( {
			action: 'veforall-parsoid-utils',
			from: 'html',
			to: 'wikitext',
			content: content,
			title: this.getPageName()
		} ).then( function ( data ) {
			var result = data && data[ 'veforall-parsoid-utils' ];
			if ( !result || typeof result.content !== 'string' ) {
				throw new Error( 'VEForAll: invalid Parsoid conversion response' );
			}
			if ( shouldApply && !shouldApply() ) {
				return;
			}

			var wikitext = result.content;
			if ( target.$node.hasClass( 'vePartOfTemplate' ) ) {
				wikitext = target.escapePipesInTables( wikitext );
			}
			target.$node.val( wikitext ).trigger( 'input' ).trigger( 'change' );
		} ).always( function () {
			// Also reset indicators when a request fails.
			target.$node.removeClass( 'oo-ui-texture-pending' );
			target.$element.removeClass( 'oo-ui-texture-pending' );
		} );
	};
	mw.veForAll.Target.prototype.setDir = function () {
		var view = this.surface.getView(),
			dir = $( 'body' ).is( '.rtl' ) ? 'rtl' : 'ltr';
		if ( view ) {
			view.getDocument().setDir( dir );
		}
	};

	mw.veForAll.Target.prototype.convertToHtml = function ( content, callback ) {
		var target = this,
			oldFormat = 'wikitext',
			newFormat = 'html';

		$( this.$node )
			.addClass( 'oo-ui-texture-pending' );

		return new mw.Api().post( {
			action: 'veforall-parsoid-utils',
			from: oldFormat,
			to: newFormat,
			content: content,
			title: this.getPageName()
		} ).then( function ( data ) {
			var htmlContent = data[ 'veforall-parsoid-utils' ].content;
			// For some reason, certain wikitext (like section names
			// containing commas) sometimes leads to this strange
			// <span> tag within the returned HTML, which in turn
			// leads to the message "Sorry, this element can only be
			// edited in source mode for now" showing up in the
			// editor in those parts. So, just get rid of this tag.
			// @todo - it would be better, of course, to figure out
			// the underlying cause of this problem, and fix that.
			var regex = /<span [^>]* typeof="mw:FallbackId" [^>]*><\/span>/g;
			htmlContent = htmlContent.replace( regex, '' );
			target.createWithHtmlContent( htmlContent );
			$( target.$node )
				.prop( 'disabled', false )
				.removeClass( 'oo-ui-texture-pending' );

			if ( typeof callback === 'function' ) {
				callback( target );
			}

		} ).fail( function () {
			// A failed first conversion must not strand a disabled source field.
			$( target.$node ).prop( 'disabled', false )
				.removeClass( 'oo-ui-texture-pending' ).show();
			if ( target.$element ) {
				$( target.$element ).removeClass( 'oo-ui-texture-pending' );
			}
			target.emit( 'editor-error' );
		} );
	};

	mw.veForAll.Target.prototype.switchEditor = function () {
		var textarea = this.$node,
			target = this,
			$wrapper = textarea.parent(),
			conversion;

		// Ignore repeated clicks while a conversion is in progress.
		if ( this.switchEditorPending ) {
			return this.switchEditorPending;
		}

		function showConversionFailure( error ) {
			if ( mw.log && mw.log.error ) {
				mw.log.error( 'VEForAll: editor switch conversion failed', error );
			}
			if ( typeof mw.notify === 'function' ) {
				mw.notify( mw.msg( 'veforall-switch-conversion-failed' ), {
					type: 'error'
				} );
			}
		}

		if ( textarea.is( ':visible' ) ) {
			// Source -> visual: leave the icon and tooltip in source mode
			// until Parsoid has successfully created the visual surface.
			this.clearSurfaces();
			conversion = this.convertToHtml( textarea.val(), function ( convertedTarget ) {
				convertedTarget.getSurface().getView().focus();
			} ).then( function () {
				$wrapper.find( '.oo-ui-icon-eye' )
					.removeClass( 'oo-ui-icon-eye' )
					.addClass( 'oo-ui-icon-wikiText' );
				$wrapper.find( '.oo-ui-tool-link' )
					.attr( 'title', OO.ui.deferMsg( 'veforall-switch-editor-tool-title' ) );
			} );
		} else {
			// Visual -> source: preserve the visual surface and its button if
			// conversion fails, so the user can retry without losing edits.
			conversion = this.updateContent().then( function () {
				$( target.getSurface().$element ).hide();
				textarea.show().trigger( 'focus' );
				$wrapper.find( '.oo-ui-icon-wikiText' )
					.removeClass( 'oo-ui-icon-wikiText' )
					.addClass( 'oo-ui-icon-eye' );
				$wrapper.find( '.oo-ui-tool-link' )
					.attr( 'title', OO.ui.deferMsg( 'visualeditor-welcomedialog-switch-ve' ) );
			} );
		}

		this.switchEditorPending = conversion;
		conversion.fail( showConversionFailure ).always( function () {
			target.switchEditorPending = null;
		} );
		return conversion;
	};
	/**
	 * Attach the toolbar to the DOM
	 * redefine attach Toolbar function to place on the bottom
	 *
	 */
	mw.veForAll.Target.prototype.attachToolbar = function () {
		var toolbar = this.getToolbar();

		if ( this.toolbarPosition === 'top' ) {
			toolbar.$element.insertBefore( toolbar.getSurface().$element );
		} else {
			$( this.$node ).after( toolbar.$element );
		}
		toolbar.initialize();
	};

	mw.veForAllUpdateAllFields = function ( $scope ) {
		var promises = [];

		( $scope || $( document ) ).find( '.visualeditor' ).each( function () {
			var $textarea = $( this ),
				target = $textarea.data( 'veForAllTarget' );

			if (
				target &&
				target.getSurface &&
				target.getSurface() !== null &&
				!$textarea.is( ':visible' ) &&
				target.$node.hasClass( 've-for-all-waiting-for-update' )
			) {
				promises.push( target.updateContent() );
			}
		} );

		if ( promises.length === 0 ) {
			return $.Deferred().resolve().promise();
		}

		return $.when.apply( $, promises );
	};

	$( function () {
		// Preserve early conversion for external save/preview integrations.
		$( document ).on( 'mousedown', '#wpSave, #wpPreview, #wpDiff', function () {
			mw.veForAllUpdateAllFields();
		} );

		function reportSubmissionError( $form, error, messageKey ) {
			$form.removeData( 'veforallSubmitPending veforallBypassSubmitOnce' );
			if ( mw.log && mw.log.error ) {
				mw.log.error( 'VEForAll: submission cancelled', error );
			}
			if ( typeof mw.notify === 'function' ) {
				mw.notify( mw.msg( messageKey || 'veforall-save-conversion-failed' ), {
					type: 'error'
				} );
			}
		}

		$( document ).on( 'submit', 'form', function ( event ) {
			var form = this,
				$form = $( form ),
				submitter = event.originalEvent && event.originalEvent.submitter ?
					event.originalEvent.submitter : null;

			if ( $form.data( 'veforallBypassSubmitOnce' ) ) {
				$form.removeData( 'veforallBypassSubmitOnce veforallSubmitPending' );
				return true;
			}
			if ( $form.data( 'veforallSubmitPending' ) ) {
				event.preventDefault();
				event.stopImmediatePropagation();
				return false;
			}

			var $fields = $form.find( 'textarea.visualeditor' );
			if ( !$fields.length ) {
				return true;
			}

			// Unchanged VisualEditors and native textareas need no conversion.
			var needsSync = $fields.toArray().some( function ( element ) {
				var $field = $( element ),
					target = $field.data( 'veForAllTarget' );
				return !!$field.data( 'veForAllPendingPromise' ) ||
					!!( target && ( target.pendingUpdatePromise ||
						( !$field.is( ':visible' ) &&
							$field.hasClass( 've-for-all-waiting-for-update' ) ) ) );
			} );
			if ( !needsSync ) {
				return true;
			}

			event.preventDefault();
			event.stopImmediatePropagation();
			$form.data( 'veforallSubmitPending', true );

			var initializing = typeof mw.veForAllWaitForPending === 'function' ?
				mw.veForAllWaitForPending( $form ) : Promise.resolve();

			Promise.resolve( initializing )
				.then( function () {
					return mw.veForAllUpdateAllFields( $form );
				} )
				.then( function () {
					// A new edit between Parsoid completion and requestSubmit
					// must not bypass the synchronized content.
					var syncedEditors = $fields.toArray().map( function ( element ) {
						var target = $( element ).data( 'veForAllTarget' );
						return {
							element: element,
							target: target,
							revision: target ? target.contentRevision : null
						};
					} );
					window.setTimeout( function () {
						if ( !document.documentElement.contains( form ) ) {
							$form.removeData( 'veforallSubmitPending' );
							return;
						}
						if ( typeof form.checkValidity === 'function' && !form.checkValidity() ) {
							$form.removeData( 'veforallSubmitPending' );
							if ( typeof form.reportValidity === 'function' ) {
								form.reportValidity();
							}
							return;
						}
						var changed = syncedEditors.some( function ( item ) {
							var $field = $( item.element ),
								target = $field.data( 'veForAllTarget' );
							return target !== item.target ||
								!!$field.data( 'veForAllPendingPromise' ) ||
								!!( target && (
									target.contentRevision !== item.revision ||
									target.pendingUpdatePromise ||
									( !$field.is( ':visible' ) &&
										$field.hasClass( 've-for-all-waiting-for-update' ) )
								) );
						} );
						if ( changed ) {
							reportSubmissionError(
								$form,
								new Error( 'VisualEditor changed after conversion' ),
								'veforall-save-content-changed'
							);
							return;
						}
						$form.data( 'veforallBypassSubmitOnce', true );
						try {
							if ( typeof form.requestSubmit === 'function' ) {
								if ( submitter && form.contains( submitter ) ) {
									form.requestSubmit( submitter );
								} else {
									form.requestSubmit();
								}
							} else {
								form.submit();
								$form.removeData( 'veforallBypassSubmitOnce veforallSubmitPending' );
							}
						} catch ( error ) {
							reportSubmissionError( $form, error );
						}
					}, 0 );
				}, function ( error ) {
					// Never submit stale textarea values after a Parsoid error.
					reportSubmissionError( $form, error );
				} );
			return false;
		} );
	} );
	// Registration
	ve.init.mw.targetFactory.register( mw.veForAll.Target );

}( mediaWiki, OO, ve ) );
