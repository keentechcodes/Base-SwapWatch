import {
  transformContractToVerification,
  parseContractABI,
  transformBaseScanTokenInfo,
  transformTransaction,
  calculateTransactionCost,
  calculateAddressMetrics,
  isValidBaseScanResponse,
  isSuccessfulResponse,
  formatWeiToEth,
  formatAddress
} from './transformers';
import { 
  BaseScanContract, 
  BaseScanTokenInfo, 
  BaseScanTransaction 
} from './types';

describe('BaseScan Transformers', () => {
  describe('transformContractToVerification', () => {
    it('should transform verified contract correctly', () => {
      const contract: BaseScanContract = {
        SourceCode: 'contract Test {}',
        ABI: '[{"type":"function"}]',
        ContractName: 'TestContract',
        CompilerVersion: 'v0.8.0',
        OptimizationUsed: '1',
        Runs: '200',
        ConstructorArguments: '',
        EVMVersion: 'istanbul',
        Library: '',
        LicenseType: 'MIT',
        Proxy: '0',
        Implementation: '',
        SwarmSource: ''
      };

      const verification = transformContractToVerification(contract);
      
      expect(verification.verified).toBe(true);
      expect(verification.contractName).toBe('TestContract');
      expect(verification.compiler).toBe('v0.8.0');
      expect(verification.optimized).toBe(true);
      expect(verification.runs).toBe(200);
      expect(verification.licenseType).toBe('MIT');
      expect(verification.sourceAvailable).toBe(false); // Source < 100 chars
    });

    it('should handle unverified contract', () => {
      const contract: BaseScanContract = {
        SourceCode: '',
        ABI: 'Contract source code not verified',
        ContractName: '',
        CompilerVersion: '',
        OptimizationUsed: '0',
        Runs: '0',
        ConstructorArguments: '',
        EVMVersion: '',
        Library: '',
        LicenseType: '',
        Proxy: '0',
        Implementation: '',
        SwarmSource: ''
      };

      const verification = transformContractToVerification(contract);
      
      expect(verification.verified).toBe(false);
      expect(verification.contractName).toBe('Unknown');
      expect(verification.sourceAvailable).toBe(false);
    });

    it('should detect proxy contracts', () => {
      const contract: BaseScanContract = {
        SourceCode: 'proxy code',
        ABI: '[]',
        ContractName: 'Proxy',
        CompilerVersion: 'v0.8.0',
        OptimizationUsed: '1',
        Runs: '200',
        ConstructorArguments: '',
        EVMVersion: '',
        Library: '',
        LicenseType: '',
        Proxy: '1',
        Implementation: '0x1234567890',
        SwarmSource: ''
      };

      const verification = transformContractToVerification(contract);
      
      expect(verification.proxyContract).toBe('0x1234567890');
    });
  });

  describe('parseContractABI', () => {
    it('should parse valid ABI', () => {
      const abiString = '[{"type":"function","name":"test"}]';
      const abi = parseContractABI(abiString);
      
      expect(abi).toEqual([{ type: 'function', name: 'test' }]);
    });

    it('should return null for invalid ABI', () => {
      expect(parseContractABI('')).toBeNull();
      expect(parseContractABI('Contract source code not verified')).toBeNull();
      expect(parseContractABI('invalid json')).toBeNull();
      expect(parseContractABI('{"not":"array"}')).toBeNull();
    });
  });

  describe('transformBaseScanTokenInfo', () => {
    it('should transform token info correctly', () => {
      const tokenInfo: BaseScanTokenInfo = {
        contractAddress: '0xabc123',
        tokenName: 'Test Token',
        symbol: 'TEST',
        divisor: '18',
        tokenType: 'ERC20',
        totalSupply: '1000000000000000000000000',
        blueCheckmark: '0',
        description: 'A test token',
        website: 'https://test.com',
        email: '',
        blog: '',
        reddit: '',
        slack: '',
        facebook: '',
        twitter: 'https://twitter.com/test',
        bitcointalk: '',
        github: 'https://github.com/test',
        telegram: 'https://t.me/test',
        wechat: '',
        linkedin: '',
        discord: 'https://discord.gg/test',
        whitepaper: '',
        tokenPriceUSD: '1.5'
      };

      const transformed = transformBaseScanTokenInfo(tokenInfo);
      
      expect(transformed.address).toBe('0xabc123');
      expect(transformed.name).toBe('Test Token');
      expect(transformed.symbol).toBe('TEST');
      expect(transformed.decimals).toBe(18);
      expect(transformed.totalSupply).toBe('1000000000000000000000000');
      expect(transformed.description).toBe('A test token');
      expect(transformed.website).toBe('https://test.com');
      expect(transformed.social?.twitter).toBe('https://twitter.com/test');
      expect(transformed.social?.telegram).toBe('https://t.me/test');
      expect(transformed.social?.discord).toBe('https://discord.gg/test');
      expect(transformed.social?.github).toBe('https://github.com/test');
    });
  });

  describe('transformTransaction', () => {
    it('should transform transaction correctly', () => {
      const tx: BaseScanTransaction = {
        blockNumber: '1000000',
        timeStamp: '1640000000',
        hash: '0xabc',
        nonce: '1',
        blockHash: '0xdef',
        transactionIndex: '0',
        from: '0xFROM',
        to: '0xTO',
        value: '1000000000000000000',
        gas: '21000',
        gasPrice: '50000000000',
        isError: '0',
        txreceipt_status: '1',
        input: '0x',
        contractAddress: '',
        cumulativeGasUsed: '21000',
        gasUsed: '21000',
        confirmations: '100',
        methodId: '0xa9059cbb',
        functionName: 'transfer'
      };

      const transformed = transformTransaction(tx);
      
      expect(transformed.hash).toBe('0xabc');
      expect(transformed.from).toBe('0xfrom');
      expect(transformed.to).toBe('0xto');
      expect(transformed.value).toBe('1000000000000000000');
      expect(transformed.blockNumber).toBe(1000000);
      expect(transformed.timestamp).toEqual(new Date(1640000000 * 1000));
      expect(transformed.status).toBe('success');
      expect(transformed.methodId).toBe('0xa9059cbb');
      expect(transformed.functionName).toBe('transfer');
    });
  });

  describe('calculateTransactionCost', () => {
    it('should calculate transaction cost in ETH', () => {
      const cost = calculateTransactionCost('21000', '50000000000');
      expect(cost).toBe('0.001050');
    });
  });

  describe('calculateAddressMetrics', () => {
    it('should calculate metrics from transactions', () => {
      const transactions: BaseScanTransaction[] = [
        {
          blockNumber: '1',
          timeStamp: '1640000000',
          hash: '0x1',
          nonce: '0',
          blockHash: '0x1',
          transactionIndex: '0',
          from: '0xAAA',
          to: '0xBBB',
          value: '1000000000000000000',
          gas: '21000',
          gasPrice: '50000000000',
          isError: '0',
          txreceipt_status: '1',
          input: '0x',
          contractAddress: '',
          cumulativeGasUsed: '21000',
          gasUsed: '21000',
          confirmations: '100',
          methodId: '',
          functionName: ''
        },
        {
          blockNumber: '2',
          timeStamp: '1640001000',
          hash: '0x2',
          nonce: '1',
          blockHash: '0x2',
          transactionIndex: '0',
          from: '0xAAA',
          to: '0xCCC',
          value: '2000000000000000000',
          gas: '21000',
          gasPrice: '50000000000',
          isError: '0',
          txreceipt_status: '1',
          input: '0x',
          contractAddress: '',
          cumulativeGasUsed: '21000',
          gasUsed: '21000',
          confirmations: '100',
          methodId: '',
          functionName: ''
        }
      ];

      const metrics = calculateAddressMetrics(transactions);
      
      expect(metrics.totalTransactions).toBe(2);
      expect(metrics.uniqueInteractions).toBe(3); // AAA, BBB, CCC
      expect(metrics.totalValueTransferred).toBe('3.000000');
      expect(metrics.firstActivity).toEqual(new Date(1640000000 * 1000));
      expect(metrics.lastActivity).toEqual(new Date(1640001000 * 1000));
    });

    it('should handle empty transactions', () => {
      const metrics = calculateAddressMetrics([]);
      
      expect(metrics.totalTransactions).toBe(0);
      expect(metrics.uniqueInteractions).toBe(0);
      expect(metrics.totalValueTransferred).toBe('0');
      expect(metrics.firstActivity).toBeNull();
      expect(metrics.lastActivity).toBeNull();
    });
  });

  describe('isValidBaseScanResponse', () => {
    it('should validate correct response', () => {
      const validResponse = {
        status: '1' as const,
        message: 'OK',
        result: []
      };
      
      expect(isValidBaseScanResponse(validResponse)).toBe(true);
    });

    it('should reject invalid responses', () => {
      expect(isValidBaseScanResponse(null)).toBe(false);
      expect(isValidBaseScanResponse({})).toBe(false);
      expect(isValidBaseScanResponse({ status: '2', message: 'OK', result: [] })).toBe(false);
    });
  });

  describe('isSuccessfulResponse', () => {
    it('should identify successful responses', () => {
      expect(isSuccessfulResponse({ status: '1', message: 'OK', result: [] })).toBe(true);
      expect(isSuccessfulResponse({ status: '0', message: 'OK', result: [] })).toBe(true);
    });

    it('should identify failed responses', () => {
      expect(isSuccessfulResponse({ status: '0', message: 'NOTOK', result: [] })).toBe(false);
    });
  });

  describe('formatWeiToEth', () => {
    it('should format wei to ETH correctly', () => {
      expect(formatWeiToEth('1000000000000000000')).toBe('1.000000');
      expect(formatWeiToEth('500000000000000000')).toBe('0.500000');
    });
  });

  describe('formatAddress', () => {
    it('should format address for display', () => {
      expect(formatAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234...5678');
    });

    it('should handle invalid addresses', () => {
      expect(formatAddress('')).toBe('');
      expect(formatAddress('0x123')).toBe('0x123');
    });
  });
});