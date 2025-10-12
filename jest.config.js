module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json'
      }
    ]
  },
  moduleNameMapper: {
    '^vscode$': '<rootDir>/__mocks__/vscode.ts'
  },
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 77,
      lines: 71,
      statements: 71,
    },
    './src/extension/panels/taskDetailPanel.ts': {
      branches: 45,
      functions: 66,
      lines: 82,
      statements: 79,
    },
  },
};
