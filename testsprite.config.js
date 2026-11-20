/**
 * TestSprite Configuration for DTAM GACP Project
 * AI-Powered Testing Automation
 */

module.exports = {
  // Project Configuration
  project: {
    name: 'DTAM GACP Certification System',
    version: '1.0.0',
    type: 'fullstack',
    url: 'http://localhost:3000'
  },

  // TestSprite AI Configuration
  ai: {
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 4000
  },

  // Testing Scope
  scope: {
    // Backend API Tests
    api: {
      enabled: true,
      baseUrl: 'http://localhost:8000/api',
      endpoints: [
        '/api/auth/*',
        '/api/applications/*',
        '/api/farms/*',
        '/api/audits/*',
        '/api/certificates/*',
        '/api/labs/*',
        '/api/trace/*',
        '/api/analytics/*',
        '/api/health'
      ]
    },

    // Frontend Tests
    frontend: {
      enabled: true,
      baseUrl: 'http://localhost:3000',
      pages: [
        '/login',
        '/register',
        '/dashboard',
        '/applications',
        '/farms',
        '/certificates',
        '/trace',
        '/provider/*'
      ]
    },

    // Mobile App Tests
    mobile: {
      enabled: true,
      platform: 'flutter',
      features: [
        'qr_scanner',
        'offline_sync',
        'batch_operations'
      ]
    }
  },

  // Test Generation Rules
  rules: {
    // Authentication Tests
    auth: {
      testLoginFlows: true,
      testRegistration: true,
      testTokenRefresh: true,
      testPermissionMatrix: true
    },

    // API Tests
    api: {
      testCRUD: true,
      testValidation: true,
      testErrorHandling: true,
      testRateLimiting: true,
      generateEdgeCases: true
    },

    // Security Tests
    security: {
      testSQLInjection: true,
      testXSS: true,
      testCSRF: true,
      testJWTSecurity: true,
      testFileUpload: true
    },

    // Business Logic Tests
    business: {
      testGACPWorkflow: true,
      testAuditProcess: true,
      testCertificateIssuance: true,
      testFraudDetection: true
    }
  },

  // Test Data Generation
  testData: {
    enabled: true,
    preserveBetweenRuns: false,
    entities: {
      users: { count: 10 },
      farms: { count: 15 },
      applications: { count: 20 },
      certificates: { count: 10 }
    }
  },

  // Output Configuration
  output: {
    format: ['html', 'json', 'junit'],
    directory: './testsprite-reports',
    includeScreenshots: true,
    includeLogs: true
  },

  // CI/CD Integration
  ci: {
    failOnError: true,
    thresholds: {
      coverage: 80,
      passRate: 95
    }
  }
};
