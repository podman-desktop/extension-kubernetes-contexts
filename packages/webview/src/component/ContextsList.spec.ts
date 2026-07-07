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

import '@testing-library/jest-dom/vitest';

import { assert, beforeEach, expect, test, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { StatesMocks } from '/@/tests/state-mocks';
import type { AvailableContextsInfo } from '@kubernetes-contexts/channels';
import { FakeStateObject } from '/@/state/util/fake-state-object.svelte';
import ContextCard from '/@/component/ContextCard.svelte';
import ContextsList from '/@/component/ContextsList.svelte';
import { kubernetesIconBase64 } from '/@/component/KubeIcon';
import type {
  ContextsHealthsInfo,
  ContextsPermissionsInfo,
  ResourcesCountInfo,
} from '@podman-desktop/kubernetes-dashboard-extension-api';
import * as uiSvelte from '@podman-desktop/ui-svelte';

vi.mock(import('/@/component/ContextCard.svelte'));

const statesMocks = new StatesMocks();
let availableContextsMock: FakeStateObject<AvailableContextsInfo, void>;
let contextsHealthsMock: FakeStateObject<ContextsHealthsInfo, void>;
let contextsPermissionsMock: FakeStateObject<ContextsPermissionsInfo, void>;
let resourcesCountMock: FakeStateObject<ResourcesCountInfo, void>;

beforeEach(() => {
  vi.resetAllMocks();
  statesMocks.reset();
  availableContextsMock = new FakeStateObject();
  contextsHealthsMock = new FakeStateObject();
  contextsPermissionsMock = new FakeStateObject();
  resourcesCountMock = new FakeStateObject();
  statesMocks.mock<AvailableContextsInfo, void>('stateAvailableContextsInfoUI', availableContextsMock);
  statesMocks.mock<ContextsHealthsInfo, void>('stateContextsHealthsInfoUI', contextsHealthsMock);
  statesMocks.mock<ContextsPermissionsInfo, void>('stateContextsPermissionsInfoUI', contextsPermissionsMock);
  statesMocks.mock<ResourcesCountInfo, void>('stateResourcesCountInfoUI', resourcesCountMock);
  vi.spyOn(uiSvelte, 'EmptyScreen');
});

test('ContextCardLine should not render cards when no available contexts', () => {
  availableContextsMock.setData({
    clusters: [],
    users: [],
    contexts: [],
    currentContext: '',
  });
  render(ContextsList);
  expect(availableContextsMock.subscribe).toHaveBeenCalled();
  expect(ContextCard).not.toHaveBeenCalled();
  expect(uiSvelte.EmptyScreen).toHaveBeenCalled();
});

test('ContextCardLine should render cards when available contexts', () => {
  availableContextsMock.setData({
    clusters: [
      {
        name: 'test-cluster-1',
        server: 'https://test-cluster-1.com',
        skipTLSVerify: false,
      },
      {
        name: 'test-cluster-2',
        server: 'https://test-cluster-2.com',
        skipTLSVerify: false,
      },
    ],
    users: [
      {
        name: 'test-user-1',
      },
      {
        name: 'test-user-2',
      },
    ],
    contexts: [
      {
        name: 'test-context-1',
        namespace: 'test-namespace-1',
        cluster: 'test-cluster-1',
        user: 'test-user-1',
      },
      {
        name: 'test-context-2',
        cluster: 'test-cluster-2',
        user: 'test-user-2',
      },
    ],
    currentContext: 'test-context-1',
  });
  render(ContextsList);
  expect(availableContextsMock.subscribe).toHaveBeenCalled();
  expect(ContextCard).toHaveBeenCalledTimes(2);
  expect(ContextCard).toHaveBeenCalledWith(expect.anything(), {
    cluster: {
      name: 'test-cluster-1',
      server: 'https://test-cluster-1.com',
      skipTLSVerify: false,
    },
    user: {
      name: 'test-user-1',
    },
    name: 'test-context-1',
    namespace: 'test-namespace-1',
    currentContext: true,
    icon: kubernetesIconBase64,
    // eslint-disable-next-line vitest/valid-expect
    onEdit: expect.any(Function),
  });
  expect(ContextCard).toHaveBeenCalledWith(expect.anything(), {
    cluster: {
      name: 'test-cluster-2',
      server: 'https://test-cluster-2.com',
      skipTLSVerify: false,
    },
    user: {
      name: 'test-user-2',
    },
    name: 'test-context-2',
    namespace: undefined,
    currentContext: false,
    icon: kubernetesIconBase64,
    // eslint-disable-next-line vitest/valid-expect
    onEdit: expect.any(Function),
  });
  expect(uiSvelte.EmptyScreen).not.toHaveBeenCalled();
});

test('ContextCard is called with the correct health', async () => {
  availableContextsMock.setData({
    clusters: [
      {
        name: 'test-cluster-1',
        server: 'https://test-cluster-1.com',
        skipTLSVerify: false,
      },
      {
        name: 'test-cluster-2',
        server: 'https://test-cluster-2.com',
        skipTLSVerify: false,
      },
    ],
    users: [
      {
        name: 'test-user-1',
      },
      {
        name: 'test-user-2',
      },
    ],
    contexts: [
      {
        name: 'test-context-1',
        namespace: 'test-namespace-1',
        cluster: 'test-cluster-1',
        user: 'test-user-1',
      },
      {
        name: 'test-context-2',
        cluster: 'test-cluster-2',
        user: 'test-user-2',
      },
    ],
    currentContext: 'test-context-1',
  });
  contextsHealthsMock.setData({
    healths: [
      {
        contextName: 'test-context-1',
        checking: false,
        reachable: false,
        offline: false,
      },
      {
        contextName: 'test-context-2',
        checking: false,
        reachable: false,
        offline: false,
      },
    ],
  });
  render(ContextsList);
  expect(ContextCard).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      health: {
        contextName: 'test-context-1',
        checking: false,
        reachable: false,
        offline: false,
      },
    }),
  );
  const contextCardMock = vi.mocked(ContextCard).mock.calls[0][1];
  assert(contextCardMock);

  // A new health state is received
  vi.mocked(ContextCard).mockClear();
  contextsHealthsMock.setData({
    healths: [
      {
        contextName: 'test-context-1',
        checking: false,
        reachable: true,
        offline: false,
      },
      {
        contextName: 'test-context-2',
        checking: false,
        reachable: false,
        offline: false,
      },
    ],
  });
  expect(contextCardMock.health).toEqual({
    contextName: 'test-context-1',
    checking: false,
    reachable: true,
    offline: false,
  });
});

test('ContextCard is called with the correct permissions', async () => {
  availableContextsMock.setData({
    clusters: [
      {
        name: 'test-cluster-1',
        server: 'https://test-cluster-1.com',
        skipTLSVerify: false,
      },
      {
        name: 'test-cluster-2',
        server: 'https://test-cluster-2.com',
        skipTLSVerify: false,
      },
    ],
    users: [
      {
        name: 'test-user-1',
      },
      {
        name: 'test-user-2',
      },
    ],
    contexts: [
      {
        name: 'test-context-1',
        namespace: 'test-namespace-1',
        cluster: 'test-cluster-1',
        user: 'test-user-1',
      },
      {
        name: 'test-context-2',
        cluster: 'test-cluster-2',
        user: 'test-user-2',
      },
    ],
    currentContext: 'test-context-1',
  });
  contextsPermissionsMock.setData({
    permissions: [
      {
        contextName: 'test-context-1',
        resourceName: 'pods',
        permitted: true,
      },
      {
        contextName: 'test-context-1',
        resourceName: 'deployments',
        permitted: false,
      },
      {
        contextName: 'test-context-1',
        resourceName: 'services',
        permitted: false,
      },
      {
        contextName: 'test-context-2',
        resourceName: 'pods',
        permitted: false,
      },
    ],
  });
  render(ContextsList);
  expect(ContextCard).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      contextsPermissions: [
        {
          contextName: 'test-context-1',
          resourceName: 'pods',
          permitted: true,
        },
        {
          contextName: 'test-context-1',
          resourceName: 'deployments',
          permitted: false,
        },
      ],
    }),
  );
  const contextCardMock = vi.mocked(ContextCard).mock.calls[0][1];
  assert(contextCardMock);

  // A new permissions state is received
  vi.mocked(ContextCard).mockClear();
  contextsPermissionsMock.setData({
    permissions: [
      {
        contextName: 'test-context-1',
        resourceName: 'pods',
        permitted: false,
      },
      {
        contextName: 'test-context-1',
        resourceName: 'deployments',
        permitted: true,
      },
    ],
  });
  expect(contextCardMock.contextsPermissions).toEqual([
    {
      contextName: 'test-context-1',
      resourceName: 'pods',
      permitted: false,
    },
    {
      contextName: 'test-context-1',
      resourceName: 'deployments',
      permitted: true,
    },
  ]);
});

test('ContextCard is called with the correct resources counts', async () => {
  availableContextsMock.setData({
    clusters: [
      {
        name: 'test-cluster-1',
        server: 'https://test-cluster-1.com',
        skipTLSVerify: false,
      },
      {
        name: 'test-cluster-2',
        server: 'https://test-cluster-2.com',
        skipTLSVerify: false,
      },
    ],
    users: [
      {
        name: 'test-user-1',
      },
      {
        name: 'test-user-2',
      },
    ],
    contexts: [
      {
        name: 'test-context-1',
        namespace: 'test-namespace-1',
        cluster: 'test-cluster-1',
        user: 'test-user-1',
      },
      {
        name: 'test-context-2',
        cluster: 'test-cluster-2',
        user: 'test-user-2',
      },
    ],
    currentContext: 'test-context-1',
  });
  resourcesCountMock.setData({
    counts: [
      {
        contextName: 'test-context-1',
        resourceName: 'pods',
        count: 1,
      },
      {
        contextName: 'test-context-1',
        resourceName: 'deployments',
        count: 2,
      },
      {
        contextName: 'test-context-1',
        resourceName: 'services',
        count: 3,
      },
      {
        contextName: 'test-context-2',
        resourceName: 'pods',
        count: 4,
      },
    ],
  });
  render(ContextsList);
  expect(ContextCard).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      resourcesCount: [
        {
          contextName: 'test-context-1',
          resourceName: 'pods',
          count: 1,
        },
        {
          contextName: 'test-context-1',
          resourceName: 'deployments',
          count: 2,
        },
      ],
    }),
  );
  const contextCardMock = vi.mocked(ContextCard).mock.calls[0][1];
  assert(contextCardMock);

  // A new resources count state is received
  vi.mocked(ContextCard).mockClear();
  resourcesCountMock.setData({
    counts: [
      {
        contextName: 'test-context-1',
        resourceName: 'pods',
        count: 11,
      },
      {
        contextName: 'test-context-1',
        resourceName: 'deployments',
        count: 12,
      },
    ],
  });
  expect(contextCardMock.resourcesCount).toEqual([
    {
      contextName: 'test-context-1',
      resourceName: 'pods',
      count: 11,
    },
    {
      contextName: 'test-context-1',
      resourceName: 'deployments',
      count: 12,
    },
  ]);
});
