/**********************************************************************
 * Copyright (C) 2025 - 2026 Red Hat, Inc.
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

import { afterEach, assert, beforeEach, describe, expect, test, vi } from 'vitest';
import { DashboardStatesManager } from './dashboard-states-manager';
import type { Disposable, ExtensionContext, TelemetryLogger } from '@podman-desktop/api';
import { extensions } from '@podman-desktop/api';
import {
  type ResourcesCountInfo,
  type ContextsHealthsInfo,
  type KubernetesDashboardExtensionApi,
  type KubernetesDashboardSubscriber,
  type ContextsPermissionsInfo,
} from '@podman-desktop/kubernetes-dashboard-extension-api';
import { InversifyBinding } from '/@/inject/inversify-binding';
import type { RpcExtension } from '@kubernetes-contexts/rpc';
import type { Container } from 'inversify';
import { DashboardApiManager } from '/@/manager/dashboard-api-manager';

let container: Container;

const dashboardApiManagerMock: DashboardApiManager = {
  getApi: vi.fn(),
} as unknown as DashboardApiManager;

beforeEach(async () => {
  vi.resetAllMocks();

  const inversifyBinding = new InversifyBinding({} as RpcExtension, {} as ExtensionContext, {} as TelemetryLogger);
  container = await inversifyBinding.initBindings();
  container.rebind(DashboardApiManager).toConstantValue(dashboardApiManagerMock);
});

describe('dashboard extension is not installed', () => {
  let manager: DashboardStatesManager;
  const onDidChangeDisposable: () => void = vi.fn();

  beforeEach(() => {
    vi.mocked(extensions.onDidChange).mockReturnValue({
      dispose: onDidChangeDisposable,
    } as unknown as Disposable);
    vi.mocked(dashboardApiManagerMock.getApi).mockReturnValue(undefined);
  });

  afterEach(() => {
    manager?.dispose();
  });

  test('subscriber is undefined', () => {
    manager = container.get(DashboardStatesManager);
    manager.init();
    expect(manager.getSubscriber()).toBeUndefined();
  });

  test('onDidChangeDisposable is called', () => {
    manager = container.get(DashboardStatesManager);
    manager.init();
    manager.dispose();
    expect(onDidChangeDisposable).toHaveBeenCalled();
  });
});

describe('dashboard extension is installed', () => {
  let manager: DashboardStatesManager;
  const onDidChangeDisposable: () => void = vi.fn();
  const subscriber: () => KubernetesDashboardSubscriber = vi.fn();
  const disposeSubscriber: () => void = vi.fn();
  const onContextsHealth: (callback: (healthInfo: ContextsHealthsInfo) => void) => void = vi.fn();
  const onResourcesCount: (callback: (countInfo: ResourcesCountInfo) => void) => void = vi.fn();
  const onContextsPermissions: (callback: (permissionsInfo: ContextsPermissionsInfo) => void) => void = vi.fn();

  beforeEach(() => {
    vi.mocked(extensions.onDidChange).mockImplementation(f => {
      setTimeout(() => {
        f();
      }, 0);
      return {
        dispose: onDidChangeDisposable,
      } as unknown as Disposable;
    });
    vi.mocked(subscriber).mockReturnValue({
      onContextsHealth: onContextsHealth,
      onResourcesCount: onResourcesCount,
      onContextsPermissions: onContextsPermissions,
      dispose: disposeSubscriber,
    } as unknown as KubernetesDashboardSubscriber);
    vi.mocked(dashboardApiManagerMock.getApi).mockReturnValue({
      getSubscriber: subscriber,
    } as unknown as KubernetesDashboardExtensionApi);
  });

  afterEach(() => {
    manager?.dispose();
  });

  test('subscriber is eventually defined', async () => {
    manager = container.get(DashboardStatesManager);
    manager.init();
    await vi.waitFor(() => {
      expect(manager.getSubscriber()).toBeDefined();
    });
  });

  test('onContextsHealth is eventually called on subscriber', async () => {
    manager = container.get(DashboardStatesManager);
    manager.init();
    await vi.waitFor(() => {
      expect(onContextsHealth).toHaveBeenCalled();
    });
  });

  test('onResourcesCount is eventually called on subscriber', async () => {
    manager = container.get(DashboardStatesManager);
    manager.init();
    await vi.waitFor(() => {
      expect(onResourcesCount).toHaveBeenCalled();
    });
  });

  test('onContextsPermissions is eventually called on subscriber', async () => {
    manager = container.get(DashboardStatesManager);
    manager.init();
    await vi.waitFor(() => {
      expect(onContextsPermissions).toHaveBeenCalled();
    });
  });

  test('when contextsHealth callback is called, onContextsHealthChange is fired', async () => {
    manager = container.get(DashboardStatesManager);
    const onContextsHealthChangeCallback: () => void = vi.fn();
    manager.onContextsHealthChange(onContextsHealthChangeCallback);

    manager.init();

    await vi.waitFor(() => {
      expect(onContextsHealth).toHaveBeenCalled();
    });
    const cb = vi.mocked(onContextsHealth).mock.calls[0][0];
    assert(cb);
    expect(onContextsHealthChangeCallback).not.toHaveBeenCalled();
    cb!({
      healths: [
        {
          contextName: 'context1',
          checking: false,
          reachable: true,
          offline: false,
        },
      ],
    });
    expect(onContextsHealthChangeCallback).toHaveBeenCalled();
  });

  test('when resourcesCount callback is called, onResourcesCountChange is fired', async () => {
    manager = container.get(DashboardStatesManager);
    const onResourcesCountChangeCallback: () => void = vi.fn();
    manager.onResourcesCountChange(onResourcesCountChangeCallback);

    manager.init();

    await vi.waitFor(() => {
      expect(onResourcesCount).toHaveBeenCalled();
    });
    const cb = vi.mocked(onResourcesCount).mock.calls[0][0];
    assert(cb);
    expect(onResourcesCountChangeCallback).not.toHaveBeenCalled();
    cb!({
      counts: [
        {
          contextName: 'context1',
          resourceName: 'resource1',
          count: 1,
        },
      ],
    });
    expect(onResourcesCountChangeCallback).toHaveBeenCalled();
  });

  test('when contextsPermissions callback is called, onContextsPermissionsChange is fired', async () => {
    manager = container.get(DashboardStatesManager);
    const onContextsPermissionsChangeCallback: () => void = vi.fn();
    manager.onContextsPermissionsChange(onContextsPermissionsChangeCallback);

    manager.init();

    await vi.waitFor(() => {
      expect(onContextsPermissions).toHaveBeenCalled();
    });
    const cb = vi.mocked(onContextsPermissions).mock.calls[0][0];
    assert(cb);
    expect(onContextsPermissionsChangeCallback).not.toHaveBeenCalled();
    cb!({
      permissions: [
        {
          contextName: 'context1',
          resourceName: 'resource1',
          permitted: true,
        },
      ],
    });
    expect(onContextsPermissionsChangeCallback).toHaveBeenCalled();
  });

  test('when contextsHealth callback is called, getContextsHealths returns the correct value', async () => {
    manager = container.get(DashboardStatesManager);
    const onContextsHealthChangeCallback: () => void = vi.fn();
    manager.onContextsHealthChange(onContextsHealthChangeCallback);

    manager.init();

    await vi.waitFor(() => {
      expect(onContextsHealth).toHaveBeenCalled();
    });
    const cb = vi.mocked(onContextsHealth).mock.calls[0][0];
    assert(cb);
    expect(onContextsHealthChangeCallback).not.toHaveBeenCalled();
    const newContextsHealths: ContextsHealthsInfo = {
      healths: [
        {
          contextName: 'context1',
          checking: false,
          reachable: true,
          offline: false,
        },
      ],
    };
    cb!(newContextsHealths);
    expect(manager.getContextsHealths()).toEqual(newContextsHealths);
  });

  test('when resourcesCount callback is called, getResourcesCount returns the correct value', async () => {
    manager = container.get(DashboardStatesManager);
    const onResourcesCountChangeCallback: () => void = vi.fn();
    manager.onResourcesCountChange(onResourcesCountChangeCallback);

    manager.init();

    await vi.waitFor(() => {
      expect(onResourcesCount).toHaveBeenCalled();
    });
    const cb = vi.mocked(onResourcesCount).mock.calls[0][0];
    assert(cb);
    expect(onResourcesCountChangeCallback).not.toHaveBeenCalled();
    const newResourcesCount: ResourcesCountInfo = {
      counts: [
        {
          contextName: 'context1',
          resourceName: 'resource1',
          count: 1,
        },
      ],
    };
    cb!(newResourcesCount);
    expect(manager.getResourcesCount()).toEqual(newResourcesCount);
  });

  test('when contextsPermissions callback is called, getContextsPermissions returns the correct value', async () => {
    manager = container.get(DashboardStatesManager);
    const onContextsPermissionsChangeCallback: () => void = vi.fn();
    manager.onContextsPermissionsChange(onContextsPermissionsChangeCallback);

    manager.init();

    await vi.waitFor(() => {
      expect(onContextsPermissions).toHaveBeenCalled();
    });
    const cb = vi.mocked(onContextsPermissions).mock.calls[0][0];
    assert(cb);
    expect(onContextsPermissionsChangeCallback).not.toHaveBeenCalled();
    const newContextsPermissions: ContextsPermissionsInfo = {
      permissions: [
        {
          contextName: 'context1',
          resourceName: 'resource1',
          permitted: true,
        },
      ],
    };
    cb!(newContextsPermissions);
    expect(manager.getContextsPermissions()).toEqual(newContextsPermissions);
  });

  test('onDidChangeDisposable is called', () => {
    manager = container.get(DashboardStatesManager);
    manager.init();
    manager.dispose();
    expect(onDidChangeDisposable).toHaveBeenCalled();
  });

  test('subscriber is disposed on dispose', async () => {
    manager = container.get(DashboardStatesManager);
    manager.init();
    await vi.waitFor(() => {
      expect(manager.getSubscriber()).toBeDefined();
    });
    manager.dispose();
    expect(disposeSubscriber).toHaveBeenCalled();
  });
});
