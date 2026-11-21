/*
 * VEForAll initialization and validation.
 * On Page Forms, initialize editors only when they approach the viewport or
 * receive focus. Native textareas remain editable while dependencies load.
 */
( function ( $, mw ) {
	'use strict';

	const veInstances = [];
	let vePlatformInitPromise = null;
	let observer;
	let firstEditorReady = false;
	const registered = new WeakSet();

	function isLazyPageFormsField( element ) {
		return mw.config.get( 'wgVEForAllLazyPageForms' ) !== false &&
			$( element ).closest( '#pfForm' ).length > 0;
	}

	function isNearViewport( element ) {
		if ( !element.getClientRects().length ) {
			return false;
		}
		const rect = element.getBoundingClientRect();
		const height = window.innerHeight || document.documentElement.clientHeight;
		return rect.top < height + 240 && rect.bottom > -240;
	}

	function initVisualEditor() {
		if ( vePlatformInitPromise ) {
			return vePlatformInitPromise;
		}
		// Loading the large VE modules is delayed together with the editor.
		const modules = [ 'ext.veforall.core' ];
		if ( mw.config.get( 'skin' ) !== 'minerva' ) {
			modules.push( 'ext.veforall.core.desktop' );
		}
		vePlatformInitPromise = Promise.resolve( mw.loader.using( modules ) )
			.then( () => new ve.init.mw.Platform().initialize() )
			.then( () => {
				ve.init.platform.addMessages( mw.messages.get() );
				if ( window.performance && window.performance.mark ) {
					window.performance.mark( 'veforall-platform-ready' );
				}
				$( document ).trigger( 'VEForAllLoaded' );
			} ).catch( ( error ) => {
				// A failed dependency fetch must not permanently break retry.
				vePlatformInitPromise = null;
				throw error;
			} );
		return vePlatformInitPromise;
	}

	function startEditor( $textarea ) {
		if ( !$textarea.length || $textarea.data( 'veForAllTarget' ) ) {
			return Promise.resolve();
		}
		const pending = $textarea.data( 'veForAllPendingPromise' );
		if ( pending ) {
			return pending;
		}
		$textarea.data( 'veForAllInitializing', true );
		if ( observer ) {
			observer.unobserve( $textarea[ 0 ] );
		}
		const promise = initVisualEditor().then( () => {
			if ( !document.documentElement.contains( $textarea[ 0 ] ) ) {
				return;
			}
			// Read the textarea NOW, not when the request started: the user may
			// have typed into it while ResourceLoader was fetching scripts.
			const editor = new mw.veForAll.Editor( $textarea[ 0 ], $textarea.val() );
			veInstances.push( editor );
			return Promise.resolve( editor.readyPromise ).then( () => {
				if ( !firstEditorReady && window.performance && window.performance.mark ) {
					firstEditorReady = true;
					window.performance.mark( 'veforall-first-editor-ready' );
				}
			} ).catch( ( error ) => {
				const index = veInstances.indexOf( editor );
				if ( index !== -1 ) {
					veInstances.splice( index, 1 );
				}
				if ( typeof editor.destroy === 'function' ) {
					editor.destroy();
				}
				throw error;
			} );
		} ).catch( ( error ) => {
			$textarea.removeData( 'veForAllInitializing' )
				.prop( 'disabled', false ).removeClass( 'oo-ui-texture-pending' );
			// Leave the source textarea and its current value untouched.
			throw error;
		} ).finally( () => {
			$textarea.removeData( 'veForAllPendingPromise' );
			if ( !$textarea.data( 'veForAllTarget' ) ) {
				$textarea.removeData( 'veForAllInitializing' );
			}
		} );
		$textarea.data( 'veForAllPendingPromise', promise );
		return promise;
	}

	function registerLazyEditor( $textarea ) {
		const element = $textarea[ 0 ];
		if ( registered.has( element ) ) {
			return;
		}
		registered.add( element );
		if ( observer === undefined ) {
			observer = typeof window.IntersectionObserver === 'function' ?
				new window.IntersectionObserver( ( entries ) => {
					entries.forEach( ( entry ) => {
						if ( entry.isIntersecting ) {
							startEditor( $( entry.target ) ).catch( () => {} );
						}
					} );
				}, { rootMargin: '240px 0px' } ) : null;
		}
		$textarea.on( 'focusin.veForAllLazy pointerdown.veForAllLazy', () => {
			startEditor( $textarea ).catch( () => {} );
		} );
		if ( observer === null || isNearViewport( element ) ) {
			startEditor( $textarea ).catch( () => {} );
		} else {
			observer.observe( element );
		}
	}

	function getUninitializedVisualEditors( $root ) {
		const $scope = $root || $( document.body );
		return $scope.find( '.visualeditor' ).addBack( '.visualeditor' ).filter( function () {
			const $textarea = $( this );
			return !$textarea.closest( '.multipleTemplateStarter, .pf-removed-instance' ).length &&
				!$textarea.data( 'veForAllTarget' ) &&
				!$textarea.data( 'veForAllInitializing' );
		} );
	}

	function applyVisualEditorToExistingFields( $root ) {
		getUninitializedVisualEditors( $root ).applyVisualEditor();
	}

	// Keep this API compatible with Page Forms and other VEForAll consumers.
	$.fn.applyVisualEditor = function () {
		return this.each( function () {
			const $textarea = $( this );
			if ( $textarea.data( 'veForAllTarget' ) || $textarea.data( 'veForAllInitializing' ) ||
				$textarea.closest( '.multipleTemplateStarter, .pf-removed-instance' ).length ) {
				return;
			}
			if ( isLazyPageFormsField( this ) ) {
				registerLazyEditor( $textarea );
			} else {
				startEditor( $textarea ).catch( () => {} );
			}
		} );
	};

	$.fn.getVEInstances = function () {
		return veInstances;
	};

	// Page Forms awaits only editors already being initialized. It does not
	// force offscreen native textareas into rich mode just to save their text.
	mw.veForAllWaitForPending = function ( $root ) {
		const pending = [];
		( $root || $( '#pfForm' ) ).find( 'textarea.visualeditor' ).each( function () {
			const promise = $( this ).data( 'veForAllPendingPromise' );
			if ( promise ) {
				pending.push( promise );
			}
		} );
		return Promise.all( pending );
	};

	mw.hook( 'pf.formSetupAfter' ).add( () => {
		applyVisualEditorToExistingFields( $( '#pfForm' ) );
	} );

	mw.hook( 'pf.addTemplateInstance' ).add( ( $newDiv ) => {
		applyVisualEditorToExistingFields( $newDiv );
	} );

	$( () => {
		const $form = $( '#pfForm' );
		if ( $form.length ) {
			applyVisualEditorToExistingFields( $form );
		} else {
			// Preserve eager initialization for non-Page Forms users (e.g. Flow).
			initVisualEditor().then( () => applyVisualEditorToExistingFields() )
				.catch( () => {} );
		}
	} );

	mw.hook( 'pf.formValidation' ).add( ( args ) => {
		let hasMinimizedPlainVETextarea = false;
		$( '.minimized' ).each( function () {
			const $instance = $( this );
			$instance.find( 'textarea.vePartOfTemplate' ).each( function () {
				if ( $( this ).css( 'display' ) !== 'none' ) {
					$instance.removeClass( 'minimized' );
					$instance.find( '.fieldValuesDisplay' ).empty();
					$instance.find( '.instanceMain' ).fadeIn();
					$instance.find( '.fieldValuesDisplay' ).remove();
					hasMinimizedPlainVETextarea = true;
				}
			} );
		} );
		if ( hasMinimizedPlainVETextarea ) {
			args.numErrors += 1;
			if ( !$( '#veforall_form_error_header' ).length ) {
				const $header = $( '<div>' ).attr( 'id', 'veforall_form_error_header' )
					.addClass( 'errorbox' ).text( mw.message( 'veforall-form-instances-not-minimized' ).text() );
				$( '#contentSub' ).append( $header );
			}
		}
	} );
}( jQuery, mediaWiki ) );
