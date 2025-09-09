import {
  Result,
  success,
  failure,
  isSuccess,
  isFailure,
  mapResult,
  mapError,
  chainResult,
  unwrapResult,
  unwrapOr,
  fromPromise,
  combineResults,
  collectSuccesses,
  collectFailures
} from './result';

describe('Result Type', () => {
  describe('creation helpers', () => {
    it('should create success result', () => {
      const result = success(42);
      expect(result).toEqual({ success: true, data: 42 });
    });

    it('should create failure result', () => {
      const error = new Error('test error');
      const result = failure(error);
      expect(result).toEqual({ success: false, error });
    });
  });

  describe('type guards', () => {
    it('should identify success results', () => {
      const successResult = success('data');
      const failureResult = failure(new Error('error'));

      expect(isSuccess(successResult)).toBe(true);
      expect(isSuccess(failureResult)).toBe(false);
    });

    it('should identify failure results', () => {
      const successResult = success('data');
      const failureResult = failure(new Error('error'));

      expect(isFailure(successResult)).toBe(false);
      expect(isFailure(failureResult)).toBe(true);
    });
  });

  describe('mapping functions', () => {
    it('should map over successful results', () => {
      const result = success(10);
      const mapped = mapResult(result, n => n * 2);

      expect(mapped).toEqual(success(20));
    });

    it('should not map over failed results', () => {
      const error = new Error('test');
      const result = failure<Error>(error);
      const mapped = mapResult(result, () => 'should not run');

      expect(mapped).toEqual(failure(error));
    });

    it('should map over errors', () => {
      const result = failure(new Error('original'));
      const mapped = mapError(result, err => new Error(`wrapped: ${err.message}`));

      expect(isFailure(mapped)).toBe(true);
      if (isFailure(mapped)) {
        expect(mapped.error.message).toBe('wrapped: original');
      }
    });

    it('should not map errors on success', () => {
      const result = success('data');
      const mapped = mapError(result, () => new Error('should not run'));

      expect(mapped).toEqual(success('data'));
    });
  });

  describe('chaining', () => {
    it('should chain successful results', () => {
      const result = success(10);
      const chained = chainResult(result, n => 
        n > 5 ? success(n * 2) : failure(new Error('too small'))
      );

      expect(chained).toEqual(success(20));
    });

    it('should short-circuit on failure', () => {
      const error = new Error('initial error');
      const result = failure<Error>(error);
      const chained = chainResult(result, () => success('should not run'));

      expect(chained).toEqual(failure(error));
    });

    it('should propagate failures from chain function', () => {
      const result = success(3);
      const chained = chainResult(result, n => 
        n > 5 ? success(n * 2) : failure(new Error('too small'))
      );

      expect(isFailure(chained)).toBe(true);
      if (isFailure(chained)) {
        expect(chained.error.message).toBe('too small');
      }
    });
  });

  describe('unwrapping', () => {
    it('should unwrap successful results', () => {
      const result = success('data');
      expect(unwrapResult(result)).toBe('data');
    });

    it('should throw on unwrapping failures', () => {
      const error = new Error('test error');
      const result = failure(error);
      
      expect(() => unwrapResult(result)).toThrow(error);
    });

    it('should unwrap with default value on success', () => {
      const result = success('data');
      expect(unwrapOr(result, 'default')).toBe('data');
    });

    it('should return default value on failure', () => {
      const result = failure(new Error('error'));
      expect(unwrapOr(result, 'default')).toBe('default');
    });
  });

  describe('promise conversion', () => {
    it('should convert successful promises to success results', async () => {
      const promise = Promise.resolve('data');
      const result = await fromPromise(promise);

      expect(result).toEqual(success('data'));
    });

    it('should convert rejected promises to failure results', async () => {
      const error = new Error('promise error');
      const promise = Promise.reject(error);
      const result = await fromPromise(promise);

      expect(result).toEqual(failure(error));
    });

    it('should map errors during conversion', async () => {
      const promise = Promise.reject('string error');
      const result = await fromPromise(promise, err => 
        new Error(`Mapped: ${err}`)
      );

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.message).toBe('Mapped: string error');
      }
    });
  });

  describe('combining results', () => {
    it('should combine all successful results', () => {
      const results: Result<number>[] = [
        success(1),
        success(2),
        success(3)
      ];

      const combined = combineResults(results);
      expect(combined).toEqual(success([1, 2, 3]));
    });

    it('should fail on first failure', () => {
      const error = new Error('failure');
      const results: Result<number>[] = [
        success(1),
        failure(error),
        success(3)
      ];

      const combined = combineResults(results);
      expect(combined).toEqual(failure(error));
    });

    it('should handle empty array', () => {
      const results: Result<number>[] = [];
      const combined = combineResults(results);
      expect(combined).toEqual(success([]));
    });
  });

  describe('collecting results', () => {
    it('should collect only successes', () => {
      const results: Result<number>[] = [
        success(1),
        failure(new Error('error')),
        success(3),
        failure(new Error('another error')),
        success(5)
      ];

      const successes = collectSuccesses(results);
      expect(successes).toEqual([1, 3, 5]);
    });

    it('should collect only failures', () => {
      const error1 = new Error('error1');
      const error2 = new Error('error2');
      const results: Result<number>[] = [
        success(1),
        failure(error1),
        success(3),
        failure(error2),
        success(5)
      ];

      const failures = collectFailures(results);
      expect(failures).toEqual([error1, error2]);
    });

    it('should handle all successes', () => {
      const results: Result<number>[] = [
        success(1),
        success(2),
        success(3)
      ];

      expect(collectSuccesses(results)).toEqual([1, 2, 3]);
      expect(collectFailures(results)).toEqual([]);
    });

    it('should handle all failures', () => {
      const errors = [new Error('1'), new Error('2')];
      const results: Result<number>[] = errors.map(failure);

      expect(collectSuccesses(results)).toEqual([]);
      expect(collectFailures(results)).toEqual(errors);
    });
  });

  describe('type inference', () => {
    it('should infer types correctly in conditionals', () => {
      const processResult = (result: Result<string, Error>): string => {
        if (isSuccess(result)) {
          // TypeScript should know result.data is string
          return result.data.toUpperCase();
        } else {
          // TypeScript should know result.error is Error
          return result.error.message;
        }
      };

      expect(processResult(success('hello'))).toBe('HELLO');
      expect(processResult(failure(new Error('oops')))).toBe('oops');
    });
  });
});