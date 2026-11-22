<?php
/**
 * Smoke checks for the Minerva hook without a MediaWiki database or server.
 * Run: php tests/php/mobile-hooks-smoke.php
 */

namespace MediaWiki {
	class MediaWikiServices {
		public static function getInstance(): self {
			return new self();
		}
		public function getHookContainer() {
			return new class {
				public function run( string $name, array $arguments ): bool {
					if ( $name === 'VEForAllToolbarConfigNormal' ) {
						$arguments[0][] = [ 'include' => [ 'custom-tool' ] ];
					}
					return true;
				}
			};
		}
		public function getService( string $name ) {
			if ( $name !== 'MobileFrontend.Context' ) {
				throw new \RuntimeException( 'Unexpected service: ' . $name );
			}
			return new class {
				public function shouldDisplayMobileView(): bool {
					return true;
				}
			};
		}
	}
}

namespace {
	class ExtensionRegistry {
		public static function getInstance(): self {
			return new self();
		}
		public function isLoaded( string $name ): bool {
			return $name === 'MobileFrontend';
		}
	}

	require dirname( __DIR__, 2 ) . '/includes/VEForAllHooks.php';

	class TestRequest {
		private string $action;
		public function __construct( string $action ) {
			$this->action = $action;
		}
		public function getVal( string $name ): ?string {
			return $name === 'action' ? $this->action : null;
		}
	}

	class TestConfig {
		public function get( string $name ): bool {
			if ( $name !== 'VEForAllLazyPageForms' ) {
				throw new \RuntimeException( 'Unexpected config: ' . $name );
			}
			return true;
		}
	}

	class TestOutput {
		public array $moduleStyles = [];
		public array $modules = [];
		private TestRequest $request;
		public function __construct( string $action ) {
			$this->request = new TestRequest( $action );
		}
		public function getTitle() {
			return null;
		}
		public function getRequest(): TestRequest {
			return $this->request;
		}
		public function getConfig(): TestConfig {
			return new TestConfig();
		}
		public function addModuleStyles( array $styles ): void {
			array_push( $this->moduleStyles, ...$styles );
		}
		public function addModules( array $modules ): void {
			array_push( $this->modules, ...$modules );
		}
	}

	class TestSkin {
		private string $name;
		public function __construct( string $name ) {
			$this->name = $name;
		}
		public function getSkinName(): string {
			return $this->name;
		}
	}

	function testCase( string $skin, string $action, array $expectedStyles ): void {
		$out = new TestOutput( $action );
		\VEForAll\VEForAllHooks::onBeforePageDisplay( $out, new TestSkin( $skin ) );
		if ( $out->moduleStyles !== $expectedStyles || $out->modules !== [] ) {
			throw new \RuntimeException( sprintf(
				'Unexpected modules for %s/%s: styles=%s, modules=%s',
				$skin,
				$action,
				json_encode( $out->moduleStyles ),
				json_encode( $out->modules )
			) );
		}
	}

	// The mobile stylesheet is bundled with ext.veforall.main instead of
	// appearing on every Minerva page, including ordinary reading.
	testCase( 'minerva', 'formedit', [] );
	testCase( 'minerva', 'view', [] );
	testCase( 'vector-2022', 'view', [] );
	testCase( 'vector-2022', 'formedit', [] );

	// A hook that appends to the configuration must not change the static
	// default for the next call (important on long-lived PHP workers).
	$normalA = \VEForAll\VEForAllHooks::getVeToolbarConfig( 'normal' );
	$normalB = \VEForAll\VEForAllHooks::getVeToolbarConfig( 'normal' );
	$wide = \VEForAll\VEForAllHooks::getVeToolbarConfig( 'wide' );
	if ( $normalA !== $normalB ||
		count( $normalA ) !== count( $wide ) + 1 ||
		end( $normalA ) !== [ 'include' => [ 'custom-tool' ] ]
	) {
		throw new \RuntimeException( 'Toolbar defaults were mutated across calls' );
	}

	echo "Minerva toolbar hook smoke checks passed.\n";
}
