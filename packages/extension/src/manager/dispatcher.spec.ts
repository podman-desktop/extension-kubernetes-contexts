/**********************************************************************
 * Copyright (C) 2025 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

import type { IDisposable } from '@kubernetes-contexts/channels';

import { ContextsManager } from './contexts-manager.js';
import type { RpcExtension } from '@kubernetes-contexts/rpc';
import type { ExtensionContext, TelemetryLogger } from '@podman-desktop/api';
import type { Container } from 'inversify';
import { InversifyBinding } from '/@/inject/inversify-binding.js';
import { AVAILABLE_CONTEXTS } from '@kubernetes-contexts/channels';
import { Dispatcher } from '/@/manager/dispatcher.js';
import { ChannelSubscriber } from '/@/manager/channel-subscriber.js';
import { DispatcherObject } from '/@/dispatcher/util/dispatcher-object.js';

let container: Container;
const contextsManagerMock: ContextsManager = {
  onContextsChange: vi.fn(),
} as unknown as ContextsManager;
const rpcExtension: RpcExtension = {
  fire: vi.fn(),
} as unknown as RpcExtension;
const extensionContext = {} as ExtensionContext;
const telemetryLogger = {} as TelemetryLogger;
const channelSubscriberMock: ChannelSubscriber = {
  onSubscribe: vi.fn(),
  hasSubscribers: vi.fn(),
  getSubscriptions: vi.fn(),
} as unknown as ChannelSubscriber;

const channel1DispatcherMock: DispatcherObject<unknown> = {
  channelName: 'channel1',
  dispatch: vi.fn(),
} as unknown as DispatcherObject<unknown>;
const channel2DispatcherMock: DispatcherObject<unknown> = {
  channelName: 'channel2',
  dispatch: vi.fn(),
} as unknown as DispatcherObject<unknown>;

let dispatcher: Dispatcher;

beforeAll(async () => {
  const inversifyBinding = new InversifyBinding(rpcExtension, extensionContext, telemetryLogger);
  container = await inversifyBinding.initBindings();
  (await container.rebind(ContextsManager)).toConstantValue(contextsManagerMock);
  (await container.rebind(ChannelSubscriber)).toConstantValue(channelSubscriberMock);
  container.bind(DispatcherObject).toConstantValue(channel1DispatcherMock);
  container.bind(DispatcherObject).toConstantValue(channel2DispatcherMock);
});

beforeEach(() => {
  vi.resetAllMocks();
  dispatcher = container.get<Dispatcher>(Dispatcher);
});

test('ContextsStatesDispatcher should dispatch available contexts when onContextsChange event is fired', async () => {
  const dispatcherSpy = vi.spyOn(dispatcher, 'dispatch').mockResolvedValue();
  dispatcher.init();
  expect(dispatcherSpy).not.toHaveBeenCalled();

  vi.mocked(contextsManagerMock.onContextsChange).mockImplementation(f => f() as IDisposable);
  dispatcher.init();
  await vi.waitFor(() => {
    expect(dispatcherSpy).toHaveBeenCalledTimes(1);
  });
  expect(dispatcherSpy).toHaveBeenCalledWith(AVAILABLE_CONTEXTS);
});

test('dispatchByChannelName is called when onSubscribe emits an event', async () => {
  const dispatchByChannelNameSpy = vi.spyOn(dispatcher, 'dispatchByChannelName').mockResolvedValue();

  vi.spyOn(channelSubscriberMock, 'onSubscribe').mockImplementation(f => f('channel1') as IDisposable);
  dispatcher.init();
  expect(dispatchByChannelNameSpy).toHaveBeenCalledWith('channel1');
});

test('dispatch of the matching dispatcher is called when dispatchByChannelName is called', async () => {
  vi.mocked(channelSubscriberMock.hasSubscribers).mockReturnValue(true);
  vi.mocked(channelSubscriberMock.getSubscriptions).mockReturnValue([
    {
      opt: 'value',
    },
  ]);
  dispatcher.init();
  await dispatcher.dispatchByChannelName('channel1');
  expect(channel1DispatcherMock.dispatch).toHaveBeenCalledWith([
    {
      opt: 'value',
    },
  ]);
  expect(channel2DispatcherMock.dispatch).not.toHaveBeenCalled();
});
