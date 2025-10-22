import { jest } from '@jest/globals';
import * as vscode from 'vscode';
import { ExtensionController } from '../../src/extension/ExtensionController';
import { Logger } from '../../src/extension/Logger';
import { ServerService } from '../../src/extension/server/ServerService';

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
  let ExtensionControllerCtor: any;

  beforeEach(() => {
    jest.resetModules();
    // prepare a fake context with subscriptions array
    // use a plain object for extensionUri to avoid depending on vscode.Uri in the test mock
    context = { subscriptions: [], extensionUri: {} };
    // spy Logger
  const logger = { log: jest.fn(), show: jest.fn() };
  jest.spyOn(Logger, 'getInstance').mockReturnValue(logger as any);
  });

  it('start registers subscriptions and calls server start', async () => {
    // replace internal dependencies by monkeypatching prototypes
    const server = new DummyServer();
    const initClient = new DummyClient();
    const taskClient = new DummyClient();
    const artifactClient = new DummyClient();

    // Ensure ServerService.getInstance returns our dummy server when called
    jest.spyOn(ServerService, 'getInstance').mockReturnValue(server as any);
    // create controller and inject serverService via deps param
  const controller = new ExtensionController(context, { serverService: server as any });

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
    const server = new DummyServer();
    const initClient = new DummyClient();
    const taskClient = new DummyClient();
    const artifactClient = new DummyClient();

    jest.spyOn(ServerService, 'getInstance').mockReturnValue(server as any);
  const controller = new ExtensionController(context, { serverService: server as any });

    controller.stop();

    // stop attempts should not throw and should attempt to stop server
    expect(server.stopServerProcess).toHaveBeenCalled();
  });
});
