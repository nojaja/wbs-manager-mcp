import { jest } from '@jest/globals';
import * as vscode from 'vscode';

// minimal mocks for clients and server
class DummyClient {
  stop = jest.fn();
}

class DummyServer {
  startLocalServer = jest.fn();
  getServerProcess = jest.fn().mockReturnValue(null);
  stopServerProcess = jest.fn();
}

describe('ExtensionController', () => {
  let context: any;
  let mockOutput: any;
  let ExtensionController: any;

  beforeEach(() => {
    jest.resetModules();
  // prepare a fake context with subscriptions array
  // use a plain object for extensionUri to avoid depending on vscode.Uri in the test mock
  context = { subscriptions: [], extensionUri: {} };
    mockOutput = { appendLine: jest.fn() };

    // mock the MCP clients and ServerService constructors to return dummies
    jest.unstable_mockModule('../../src/extension/ExtensionController', async () => {
      const original = await import('../../src/extension/ExtensionController');
      return {
        ...original
      };
    });
  });

  it('start registers subscriptions and calls server start', async () => {
    // dynamic import of the controller module
    const mod = await import('../../src/extension/ExtensionController');
    ExtensionController = mod.ExtensionController;

    // replace internal dependencies by monkeypatching prototypes
    const server = new DummyServer();
    const initClient = new DummyClient();
    const taskClient = new DummyClient();
    const artifactClient = new DummyClient();

    // create controller with injected mocks
    const controller = new ExtensionController(context, {
      outputChannel: mockOutput,
      serverService: server,
      initializeClient: initClient,
      taskClient: taskClient,
      artifactClient: artifactClient
    });

    try {
      await controller.start();
    } catch (err) {
      const e: any = err;
      console.log('TEST: controller.start threw:', e && e.stack ? e.stack : e);
      throw err;
    }

    // server start should have been called
  expect(server.startLocalServer).toHaveBeenCalled();

  // some subscriptions should be registered (commands + views + channel)
  expect(context.subscriptions.length).toBeGreaterThan(0);
  });

  it('stop calls stop on clients and server', async () => {
    const mod = await import('../../src/extension/ExtensionController');
    ExtensionController = mod.ExtensionController;

    const server = new DummyServer();
    const initClient = new DummyClient();
    const taskClient = new DummyClient();
    const artifactClient = new DummyClient();

    const controller = new ExtensionController(context, {
      outputChannel: mockOutput,
      serverService: server,
      initializeClient: initClient,
      taskClient: taskClient,
      artifactClient: artifactClient
    });

    controller.stop();

    expect(initClient.stop).toHaveBeenCalled();
    expect(taskClient.stop).toHaveBeenCalled();
    expect(artifactClient.stop).toHaveBeenCalled();
    expect(server.stopServerProcess).toHaveBeenCalled();
  });
});
