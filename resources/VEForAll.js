/*
 * VEForAll initialization and validation
 *
 * @author Pierre Boutet
 * @author Clement Flipo
 * @author Yaron Koren
 */

/* globals jQuery, mw, ve */

( function ( $, mw ) {

	var veInstances = [],
		vePlatformInitPromise = null;

	function initVisualEditor() {
		if ( vePlatformInitPromise ) {
			return vePlatformInitPromise;
		}

		// Init VisualEditor platform
		vePlatformInitPromise = new ve.init.mw.Platform().initialize()
			.fail( function () {
				// $( editor ).text( 'Sorry, this browser is not supported.' );
			} )
			.done( function () {
				// Add i18n messages to VE
				ve.init.platform.addMessages( mw.messages.get() );
				applyVisualEditorToExistingFields();
				// Let others know we're done here
				$( document ).trigger( 'VEForAllLoaded' );
			} );

		return vePlatformInitPromise;
	}

	function getUninitializedVisualEditors( $root ) {
		var $scope = $root ? $root : $( document.body );

		return $scope.find( '.visualeditor' ).addBack( '.visualeditor' ).filter( function () {
			var $textarea = $( this );

			return $textarea.closest( '.multipleTemplateStarter' ).length === 0 &&
				!$textarea.data( 'veForAllTarget' ) &&
				!$textarea.data( 'veForAllInitializing' );
		} );
	}

	function applyVisualEditorToExistingFields( $root ) {
		getUninitializedVisualEditors( $root ).applyVisualEditor();
	}

	/**
	 * The main function called by outside extensions - applies VisualEditor
	 * onto any jQuery group of textareas.
	 *
	 * @return {boolean}
	 */
	jQuery.fn.applyVisualEditor = function () {
		return this.each( function () {
			var $textarea = $( this ),
				veEditor;

			if ( $textarea.data( 'veForAllTarget' ) || $textarea.data( 'veForAllInitializing' ) ) {
				return;
			}

			$textarea.data( 'veForAllInitializing', true );
			veEditor = new mw.veForAll.Editor( this, $textarea.val() );
			veInstances.push( veEditor );
		} );
	};

	/**
	 * @return {Array}
	 */
	jQuery.fn.getVEInstances = function () {
		return veInstances;
	};

	if ( mw.hook( 'pf.formSetupAfter' ) ) {
		// If this is being called from within the Page Forms extension,
		// make sure that the init code is called after the form has
		// already been created.
		mw.hook( 'pf.formSetupAfter' ).add( function () {
			initVisualEditor().done( function () {
				applyVisualEditorToExistingFields( $( '#pfForm' ) );
			} );
		} );
	} else {
		initVisualEditor().done( function () {
			applyVisualEditorToExistingFields();
		} );
	}

	mw.hook( 'pf.addTemplateInstance' ).add( function ( $newDiv ) {
		initVisualEditor().done( function () {
			applyVisualEditorToExistingFields( $newDiv );
		} );
	} );

	$( function () {
		initVisualEditor().done( function () {
			applyVisualEditorToExistingFields( $( '#pfForm' ) );
		} );
	} );

	mw.hook( 'pf.formValidation' ).add( function ( args ) {
		var hasMinimizedPlainVETextarea = false;
		$( '.minimized' ).each( function () {
			var instanceDiv = $( this );
			instanceDiv.find( 'textarea.vePartOfTemplate' ).each( function () {
				if ( $( this ).css( 'display' ) !== 'none' ) {
					instanceDiv.removeClass( 'minimized' );
					instanceDiv.find( '.fieldValuesDisplay' ).html( '' );
					instanceDiv.find( '.instanceMain' ).fadeIn();
					instanceDiv.find( '.fieldValuesDisplay' ).remove();
					hasMinimizedPlainVETextarea = true;
				}
			} );
		} );
		if ( hasMinimizedPlainVETextarea ) {
			args.numErrors += 1;
			// Only add this error message if it's not already there.
			if ( $( '#veforall_form_error_header' ).length === 0 ) {
				$( '#contentSub' ).append( '<div id="veforall_form_error_header" class="errorbox" style="font-size: medium"><img src="' +
					mw.config.get( 'wgPageFormsScriptPath' ) + '/skins/MW-Icon-AlertMark.png" />&nbsp;' +
					mw.message( 'veforall-form-instances-not-minimized' ).escaped() + '</div><br clear="both" />' );
			}
		}

	} );

}( jQuery, mw ) );
