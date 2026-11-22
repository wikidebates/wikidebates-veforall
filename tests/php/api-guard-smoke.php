<?php
/**
 * Smoke tests for the VEForAll conversion API before expensive Parsoid runs.
 * Run: php tests/php/api-guard-smoke.php
 */
namespace MediaWiki\Title {
	class Title {
	}
}

namespace {
	class TestApiRejected extends \RuntimeException {
	}

	class ApiBase {
		public const PARAM_REQUIRED = 'required';
		public const PARAM_TYPE = 'type';
		public const PARAM_ISMULTI = 'multi';
		public array $params = [];
		public int $maxBytes = 64;
		public int $titleCalls = 0;
		public array $resultValues = [];

		public function extractRequestParams(): array {
			return $this->params;
		}

		public function getConfig() {
			$limit = $this->maxBytes;
			return new class ( $limit ) {
				public function __construct( private int $limit ) {
				}
				public function get( string $key ): int {
					if ( $key !== 'VEForAllMaxConversionBytes' ) {
						throw new \LogicException( 'Unexpected key ' . $key );
					}
					return $this->limit;
				}
			};
		}

		public function getTitleOrPageId( array $params ) {
			$this->titleCalls++;
			return new class {
				public function getTitle() {
					return new \MediaWiki\Title\Title();
				}
			};
		}

		public function getResult() {
			return new class ( $this ) {
				public function __construct( private ApiBase $api ) {
				}
				public function addValue( $parent, string $key, array $value ): void {
					$this->api->resultValues[$key] = $value;
				}
			};
		}

		public function getModuleName(): string {
			return 'veforall-parsoid-utils';
		}

		public function dieWithError( $msg, $code = null, $data = null, $httpCode = 0 ): void {
			if ( $code !== 'veforall-content-too-large' || $httpCode !== 413 ) {
				throw new \LogicException( 'Unexpected API rejection' );
			}
			throw new TestApiRejected( $code );
		}
	}

	require dirname( __DIR__, 2 ) . '/includes/ApiParsoidUtils.php';
	require dirname( __DIR__, 2 ) . '/includes/ApiParsoidUtilsOld.php';

	foreach ( [ new \VEForAll\ApiParsoidUtils(), new \VEForAll\ApiParsoidUtilsOld() ] as $api ) {
		if ( $api->mustBePosted() !== true ) {
			throw new \RuntimeException( 'Conversion must require POST' );
		}
		$api->params = [
			'from' => 'html',
			'to' => 'html',
			'content' => str_repeat( 'a', 65 )
		];
		try {
			$api->execute();
			throw new \RuntimeException( 'Oversized content unexpectedly accepted' );
		} catch ( TestApiRejected $e ) {
			if ( $api->titleCalls !== 0 ) {
				throw new \RuntimeException( 'Oversized content reached page resolution' );
			}
		}

		// The guard uses bytes rather than UTF-8 character count.
		$api->params['content'] = str_repeat( 'é', 33 );
		try {
			$api->execute();
			throw new \RuntimeException( 'Oversized UTF-8 content unexpectedly accepted' );
		} catch ( TestApiRejected $e ) {
		}

		$api->params['content'] = str_repeat( 'a', 64 );
		$api->execute();
		if ( $api->resultValues['veforall-parsoid-utils']['content'] !== str_repeat( 'a', 64 ) ) {
			throw new \RuntimeException( 'Valid content was not preserved' );
		}

		// Explicit 0 disables the cap for installations with large valid fields.
		$api->maxBytes = 0;
		$api->params['content'] = str_repeat( 'a', 65 );
		$api->execute();
	}

	echo "VEForAll Parsoid input limits passed.\n";
}
