/**********************************************************************
 * Copyright (C) 2024 - 2025 Red Hat, Inc.
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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ContextsManager } from '/@/manager/contexts-manager';
import { KubeConfig } from '@kubernetes/client-node';
import type { ExtensionContext, TelemetryLogger, Uri } from '@podman-desktop/api';
import { kubernetes, window } from '@podman-desktop/api';
import { vol } from 'memfs';
import { InversifyBinding } from '/@/inject/inversify-binding';
import type { RpcExtension } from '@kubernetes-contexts/rpc';
import { DashboardApiManager } from '/@/manager/dashboard-api-manager';
import type { Container } from 'inversify';
import type { KubernetesDashboardExtensionApi } from '@podman-desktop/kubernetes-dashboard-extension-api';

const dashboardApiManagerMock: DashboardApiManager = {
  getApi: vi.fn(),
} as unknown as DashboardApiManager;

const telemetryLoggerMock: TelemetryLogger = {
  logUsage: vi.fn(),
} as unknown as TelemetryLogger;

let container: Container;

beforeEach(async () => {
  vi.resetAllMocks();
  vol.reset();

  const inversifyBinding = new InversifyBinding({} as RpcExtension, {} as ExtensionContext, telemetryLoggerMock);
  container = await inversifyBinding.initBindings();
  (await container.rebindAsync(DashboardApiManager)).toConstantValue(dashboardApiManagerMock);
});

vi.mock(import('node:fs/promises'));
vi.mock(import('node:fs'));

test('default KubeConfig should be empty', () => {
  const contextsManager = container.get(ContextsManager);
  expect(contextsManager.getKubeConfig()).toEqual(new KubeConfig());
});

test('update should set the KubeConfig', async () => {
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  kubeConfig.loadFromString(`
    clusters:
      - name: cluster1
        cluster:
          server: https://cluster1.example.com
    users:
      - name: user1
    contexts:
      - name: context1
        context:
          cluster: cluster1
          user: user1
  `);
  await contextsManager.update(kubeConfig);
  expect(contextsManager.getKubeConfig()).toEqual(kubeConfig);
});

test('update triggers onContextsChange', async () => {
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  kubeConfig.loadFromString(`
    clusters:
      - name: cluster1
        cluster:
          server: https://cluster1.example.com
    users:
      - name: user1
    contexts:
      - name: context1
        context:
          cluster: cluster1
          user: user1
  `);
  const onContextsChangeCallback: () => void = vi.fn();
  contextsManager.onContextsChange(onContextsChangeCallback);
  expect(onContextsChangeCallback).not.toHaveBeenCalled();
  await contextsManager.update(kubeConfig);
  expect(onContextsChangeCallback).toHaveBeenCalledOnce();
  expect(onContextsChangeCallback).toHaveBeenCalledWith(undefined);
});

test('setCurrentContext should show error notification if it fails', async () => {
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  kubeConfig.loadFromString(`
    clusters:
      - name: cluster1
        cluster:
          server: https://cluster1.example.com
  `);
  vi.mocked(kubernetes.getKubeconfig).mockImplementation(() => {
    throw new Error('error getting kubeconfig path');
  });
  await contextsManager.setCurrentContext('context2');
  expect(window.showNotification).toHaveBeenCalledWith({
    title: 'Error setting current context',
    body: 'Setting current context to "context2" failed: Error: error getting kubeconfig path',
    type: 'error',
    highlight: true,
  });
  expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('setCurrentContext');
});

test('setCurrentContext rewrites file with new current context', async () => {
  const kubeConfigPath = '/path/to/kube/config';
  vol.fromJSON({
    [kubeConfigPath]: '{}',
  });
  vi.mocked(kubernetes.getKubeconfig).mockReturnValue({
    path: kubeConfigPath,
  } as Uri);
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  const kubeconfigFileContent = `{
      clusters: [
        {
          name: 'cluster1',
          cluster: {
            server: 'https://cluster1.example.com',
          },
        },
      ],
      users: [
        {
          name: 'user1',
        },
      ],
      contexts: [
        {
          name: 'context1',
          context: {
            cluster: 'cluster1',
            user: 'user1',
          },
        },
      ],
    }`;
  kubeConfig.loadFromString(kubeconfigFileContent);
  await contextsManager.update(kubeConfig);

  await contextsManager.setCurrentContext('context1');

  const fsScreenshot = vol.toJSON();
  const kubeconfigFile = fsScreenshot['/path/to/kube/config'];
  const kubeconfigFileNew = new KubeConfig();
  kubeconfigFileNew.loadFromString(kubeconfigFile ?? '');
  expect(kubeconfigFileNew.getCurrentContext()).toEqual('context1');
  expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('setCurrentContext');
});

describe('removeContext', () => {
  test('the context and its references are removed from the KubeConfig', () => {
    const contextsManager = container.get(ContextsManager);
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromString(`
      contexts:
        - name: context1
          context:
            cluster: cluster1
            user: user1
        - name: context2
          context:
            cluster: cluster2
            user: user2
      current-context: context1
      clusters:
        - name: cluster1
          cluster:
            server: https://cluster1.example.com
        - name: cluster2
          cluster:
            server: https://cluster2.example.com
      users:
        - name: user1
        - name: user2
    `);
    const newKubeConfig = contextsManager.removeContext(kubeConfig, 'context1');
    expect(newKubeConfig.getContexts()).toEqual([
      {
        name: 'context2',
        cluster: 'cluster2',
        user: 'user2',
      },
    ]);
    expect(newKubeConfig.getClusters()).toEqual([
      {
        name: 'cluster2',
        server: 'https://cluster2.example.com',
        skipTLSVerify: false,
      },
    ]);
    expect(newKubeConfig.getUsers().length).toEqual(1);
    expect(newKubeConfig.getUsers()[0].name).toEqual('user2');
    expect(newKubeConfig.getCurrentContext()).toEqual('');
    expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('deleteContext');
  });

  test('the current context is not changed if it is not the context to remove', () => {
    const contextsManager = container.get(ContextsManager);
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromString(`
      contexts:
        - name: context1
          context:
            cluster: cluster1
            user: user1
        - name: context2
          context:
            cluster: cluster2
            user: user2
      current-context: context2
      clusters:
        - name: cluster1
          cluster:
            server: https://cluster1.example.com
        - name: cluster2
          cluster:
            server: https://cluster2.example.com
      users:
        - name: user1
        - name: user2
    `);
    const newKubeConfig = contextsManager.removeContext(kubeConfig, 'context1');
    expect(newKubeConfig.getContexts()).toEqual([
      {
        name: 'context2',
        cluster: 'cluster2',
        user: 'user2',
      },
    ]);
    expect(newKubeConfig.getClusters()).toEqual([
      {
        name: 'cluster2',
        server: 'https://cluster2.example.com',
        skipTLSVerify: false,
      },
    ]);
    expect(newKubeConfig.getUsers().length).toEqual(1);
    expect(newKubeConfig.getUsers()[0].name).toEqual('user2');
    expect(newKubeConfig.getCurrentContext()).toEqual('context2');
    expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('deleteContext');
  });

  test('unrelated references are not removed from the KubeConfig', () => {
    const contextsManager = container.get(ContextsManager);
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromString(`
      contexts:
        - name: context1
          context:
            cluster: cluster1
            user: user1
        - name: context2
          context:
            cluster: cluster2
            user: user2        
      current-context: context1
      clusters:
        - name: cluster1
          cluster:
            server: https://cluster1.example.com
        - name: cluster2
          cluster:
            server: https://cluster2.example.com
        - name: cluster3
          cluster:
            server: https://cluster3.example.com
      users:
        - name: user1
        - name: user2
        - name: user3
    `);
    const newKubeConfig = contextsManager.removeContext(kubeConfig, 'context1');
    expect(newKubeConfig.getContexts()).toEqual([
      {
        name: 'context2',
        cluster: 'cluster2',
        user: 'user2',
      },
    ]);
    expect(newKubeConfig.getClusters()).toEqual([
      {
        name: 'cluster2',
        server: 'https://cluster2.example.com',
        skipTLSVerify: false,
      },
      {
        name: 'cluster3',
        server: 'https://cluster3.example.com',
        skipTLSVerify: false,
      },
    ]);
    expect(newKubeConfig.getUsers().length).toEqual(2);
    expect(newKubeConfig.getUsers()[0].name).toEqual('user2');
    expect(newKubeConfig.getUsers()[1].name).toEqual('user3');
    expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('deleteContext');
  });

  test('same KubeConfig is returned if context to remove is not found', () => {
    const contextsManager = container.get(ContextsManager);
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromString(`
      contexts:
        - name: context1
          context:
            cluster: cluster1
            user: user1
      current-context: context1
      clusters:
        - name: cluster1
          cluster:
            server: https://cluster1.example.com
      users:
        - name: user1
    `);
    const newKubeConfig = contextsManager.removeContext(kubeConfig, 'context2');
    expect(newKubeConfig.getContexts()).toEqual([
      {
        name: 'context1',
        cluster: 'cluster1',
        user: 'user1',
      },
    ]);
    expect(newKubeConfig.getClusters()).toEqual([
      {
        name: 'cluster1',
        server: 'https://cluster1.example.com',
        skipTLSVerify: false,
      },
    ]);
    expect(newKubeConfig.getUsers().length).toEqual(1);
    expect(newKubeConfig.getUsers()[0].name).toEqual('user1');
    expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('deleteContext');
  });
});

test('deleteContext should show error notification if it fails', async () => {
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  kubeConfig.loadFromString(`
    clusters:
      - name: cluster1
        cluster:
          server: https://cluster1.example.com
  `);
  vi.mocked(kubernetes.getKubeconfig).mockImplementation(() => {
    throw new Error('error getting kubeconfig path');
  });
  vi.mocked(window.showInformationMessage).mockResolvedValue('Yes');
  await contextsManager.deleteContext('context1');
  expect(window.showNotification).toHaveBeenCalledWith({
    title: 'Error deleting context',
    body: 'Deleting context "context1" failed: Error: error getting kubeconfig path',
    type: 'error',
    highlight: true,
  });
  expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('deleteContext');
});

test('deleteContext for non-current context asks for confirmation and deletes on Yes', async () => {
  const kubeConfigPath = '/path/to/kube/config';
  vol.fromJSON({
    [kubeConfigPath]: '{}',
  });
  vi.mocked(kubernetes.getKubeconfig).mockReturnValue({
    path: kubeConfigPath,
  } as Uri);
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  const kubeconfigFileContent = `{
      clusters: [
        {
          name: 'cluster1',
          cluster: {
            server: 'https://cluster1.example.com',
          },
        },
        {
          name: 'cluster2',
          cluster: {
            server: 'https://cluster2.example.com',
          },
        },
        {
          name: 'cluster3',
          cluster: {
            server: 'https://cluster3.example.com',
          },
        },
      ],
      users: [
        {
          name: 'user1',
        },
        {
          name: 'user2',
        },
        {
          name: 'user3',
        },
      ],
      contexts: [
        {
          name: 'context1',
          context: {
            cluster: 'cluster1',
            user: 'user1',
          },
        },
        {
          name: 'context2',
          context: {
            cluster: 'cluster2',
            user: 'user2',
          },
        },
        {
          name: 'context3',
          context: {
            cluster: 'cluster3',
            user: 'user3',
          },
        },
      ],
    }`;
  kubeConfig.loadFromString(kubeconfigFileContent);
  await contextsManager.update(kubeConfig);

  vi.mocked(window.showInformationMessage).mockResolvedValue('Yes');

  await contextsManager.deleteContext('context1');

  const fsScreenshot = vol.toJSON();
  const kubeconfigFile = fsScreenshot['/path/to/kube/config'];
  const kubeconfigFileNew = new KubeConfig();
  kubeconfigFileNew.loadFromString(kubeconfigFile ?? '');
  expect(kubeconfigFileNew.getContexts()).toHaveLength(2);
  expect(window.showInformationMessage).toHaveBeenCalledWith(
    'Are you sure you want to delete context "context1"?',
    'Yes',
    'Cancel',
  );
  expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('deleteContext');
});

test('deleteContext for non-current context does nothing if refused', async () => {
  const kubeConfigPath = '/path/to/kube/config';
  vol.fromJSON({
    [kubeConfigPath]: '{}',
  });
  vi.mocked(kubernetes.getKubeconfig).mockReturnValue({
    path: kubeConfigPath,
  } as Uri);
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  const kubeconfigFileContent = `{
      clusters: [
        {
          name: 'cluster1',
          cluster: {
            server: 'https://cluster1.example.com',
          },
        },
        {
          name: 'cluster2',
          cluster: {
            server: 'https://cluster2.example.com',
          },
        },
      ],
      users: [
        {
          name: 'user1',
        },
        {
          name: 'user2',
        },
      ],
      contexts: [
        {
          name: 'context1',
          context: {
            cluster: 'cluster1',
            user: 'user1',
          },
        },
        {
          name: 'context2',
          context: {
            cluster: 'cluster2',
            user: 'user2',
          },
        },
      ],
    }`;
  kubeConfig.loadFromString(kubeconfigFileContent);
  await contextsManager.update(kubeConfig);

  vi.mocked(window.showInformationMessage).mockResolvedValue('Cancel');

  await contextsManager.deleteContext('context1');

  const fsScreenshot = vol.toJSON();
  const kubeconfigFile = fsScreenshot['/path/to/kube/config'];
  expect(kubeconfigFile).toEqual('{}');
});

test('deleteContext the current context asks for confirmation', async () => {
  const kubeConfigPath = '/path/to/kube/config';
  vol.fromJSON({
    [kubeConfigPath]: '{}',
  });
  vi.mocked(kubernetes.getKubeconfig).mockReturnValue({
    path: kubeConfigPath,
  } as Uri);
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  const kubeconfigFileContent = `{
    clusters: [
      {
        name: 'cluster1',
        cluster: {
          server: 'https://cluster1.example.com',
        },
      },
      {
        name: 'cluster2',
        cluster: {
          server: 'https://cluster2.example.com',
        },
      },
      {
        name: 'cluster3',
        cluster: {
          server: 'https://cluster3.example.com',
        },
      },
    ],
    users: [
      {
        name: 'user1',
      },
      {
        name: 'user2',
      },
      {
        name: 'user3',
      },
    ],
    contexts: [
      {
        name: 'context1',
        context: {
          cluster: 'cluster1',
          user: 'user1',
        },
      },
      {
        name: 'context2',
        context: {
          cluster: 'cluster2',
          user: 'user2',
        },
      },
      {
        name: 'context3',
        context: {
          cluster: 'cluster3',
          user: 'user3',
        },
      },
    ],
    "current-context": "context1"
  }`;
  kubeConfig.loadFromString(kubeconfigFileContent);
  await contextsManager.update(kubeConfig);

  expect(contextsManager.getKubeConfig().getContexts()).toHaveLength(3);

  vi.mocked(window.showInformationMessage).mockResolvedValue('Yes');

  await contextsManager.deleteContext('context1');

  const fsScreenshot = vol.toJSON();
  const kubeconfigFile = fsScreenshot['/path/to/kube/config'];
  const kubeconfigFileNew = new KubeConfig();
  kubeconfigFileNew.loadFromString(kubeconfigFile ?? '');
  expect(kubeconfigFileNew.getContexts()).toHaveLength(2);
  expect(window.showInformationMessage).toHaveBeenCalledWith(
    'Are you sure you want to delete context "context1"? This is the current context, you will need to switch to another context.',
    'Yes',
    'Cancel',
  );
  expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('deleteContext');
});

test('deleteContext the current context asks for confirmation, and do nothing if refused', async () => {
  const kubeConfigPath = '/path/to/kube/config';
  vol.fromJSON({
    [kubeConfigPath]: '{}',
  });
  vi.mocked(kubernetes.getKubeconfig).mockReturnValue({
    path: kubeConfigPath,
  } as Uri);
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  const kubeconfigFileContent = `{
    clusters: [
      {
        name: 'cluster1',
        cluster: {
          server: 'https://cluster1.example.com',
        },
      },
      {
        name: 'cluster2',
        cluster: {
          server: 'https://cluster2.example.com',
        },
      },
      {
        name: 'cluster3',
        cluster: {
          server: 'https://cluster3.example.com',
        },
      },
    ],
    users: [
      {
        name: 'user1',
      },
      {
        name: 'user2',
      },
      {
        name: 'user3',
      },
    ],
    contexts: [
      {
        name: 'context1',
        context: {
          cluster: 'cluster1',
          user: 'user1',
        },
      },
      {
        name: 'context2',
        context: {
          cluster: 'cluster2',
          user: 'user2',
        },
      },
      {
        name: 'context3',
        context: {
          cluster: 'cluster3',
          user: 'user3',
        },
      },
    ],
    "current-context": "context1"
  }`;
  kubeConfig.loadFromString(kubeconfigFileContent);
  await contextsManager.update(kubeConfig);

  expect(contextsManager.getKubeConfig().getContexts()).toHaveLength(3);

  vi.mocked(window.showInformationMessage).mockResolvedValue('Cancel');

  await contextsManager.deleteContext('context1');

  const fsScreenshot = vol.toJSON();
  const kubeconfigFile = fsScreenshot['/path/to/kube/config'];
  expect(kubeconfigFile).toEqual('{}');
});

test('should duplicate context from config', async () => {
  const kubeConfigPath = '/path/to/kube/config';
  vol.fromJSON({
    [kubeConfigPath]: '{}',
  });
  vi.mocked(kubernetes.getKubeconfig).mockReturnValue({
    path: kubeConfigPath,
  } as Uri);
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  const kubeconfigFileContent = `{
    clusters: [
      {
        name: 'cluster1',
        cluster: {
          server: 'https://cluster1.example.com',
        },
      },
    ],
    users: [
      {
        name: 'user1',
      },
    ],
    contexts: [
      {
        name: 'context1',
        context: {
          cluster: 'cluster1',
          user: 'user1',
        },
      },
    ],
    "current-context": "context1"
  }`;
  kubeConfig.loadFromString(kubeconfigFileContent);
  await contextsManager.update(kubeConfig);

  expect(contextsManager.getKubeConfig().getContexts()).toHaveLength(1);

  await contextsManager.duplicateContext(kubeConfig.contexts[0].name);
  let contexts = contextsManager.getKubeConfig().getContexts();
  expect(contexts.length).toBe(2);

  expect(contexts[1].name).toBe('context1-1');

  await contextsManager.duplicateContext(kubeConfig.contexts[0].name);
  contexts = contextsManager.getKubeConfig().getContexts();
  expect(contexts.length).toBe(3);
  expect(contexts[2].name).toBe('context1-2');
  expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('duplicateContext');
});

test('should update context from config', async () => {
  const kubeConfigPath = '/path/to/kube/config';
  vol.fromJSON({
    [kubeConfigPath]: '{}',
  });
  vi.mocked(kubernetes.getKubeconfig).mockReturnValue({
    path: kubeConfigPath,
  } as Uri);
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  const kubeconfigFileContent = `{
    clusters: [
      {
        name: 'cluster1',
        cluster: {
          server: 'https://cluster1.example.com',
        },
      },
    ],
    users: [
      {
        name: 'user1',
      },
    ],
    contexts: [
      {
        name: 'context1',
        context: {
          cluster: 'cluster1',
          user: 'user1',
        },
      },
    ],
    "current-context": "context1"
  }`;
  kubeConfig.loadFromString(kubeconfigFileContent);
  await contextsManager.update(kubeConfig);

  expect(contextsManager.getKubeConfig().getContexts()).toHaveLength(1);

  await contextsManager.editContext(kubeConfig.contexts[0].name, {
    name: 'context1-edited',
    namespace: 'namespace-edited',
    cluster: 'cluster1',
    user: 'user1',
  });
  const contexts = contextsManager.getKubeConfig().getContexts();
  expect(contexts.length).toBe(1);

  expect(contexts[0].name).toBe('context1-edited');
  expect(contexts[0].namespace).toBe('namespace-edited');
  expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('editContext');
});

test('should remove the namespace when updating context from config', async () => {
  const kubeConfigPath = '/path/to/kube/config';
  vol.fromJSON({
    [kubeConfigPath]: '{}',
  });
  vi.mocked(kubernetes.getKubeconfig).mockReturnValue({
    path: kubeConfigPath,
  } as Uri);
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  const kubeconfigFileContent = `{
    clusters: [
      {
        name: 'cluster1',
        cluster: {
          server: 'https://cluster1.example.com',
        },
      },
    ],
    users: [
      {
        name: 'user1',
      },
    ],
    contexts: [
      {
        name: 'context1',
        context: {
          cluster: 'cluster1',
          user: 'user1',
          namespace: 'namespace1'
        }
      }
    ],
    "current-context": "context1"
  }`;
  kubeConfig.loadFromString(kubeconfigFileContent);
  await contextsManager.update(kubeConfig);

  expect(contextsManager.getKubeConfig().getContexts()).toHaveLength(1);
  const contexts = contextsManager.getKubeConfig().getContexts();
  expect(contexts[0].namespace).toBe('namespace1');

  await contextsManager.editContext(kubeConfig.contexts[0].name, {
    name: kubeConfig.contexts[0].name,
    namespace: '',
    cluster: 'cluster1',
    user: 'user1',
  });
  const contexts2 = contextsManager.getKubeConfig().getContexts();
  expect(contexts2[0].namespace).toBeUndefined();
  expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('editContext');
});

test('should update the cluster updating context from config', async () => {
  const kubeConfigPath = '/path/to/kube/config';
  vol.fromJSON({
    [kubeConfigPath]: '{}',
  });
  vi.mocked(kubernetes.getKubeconfig).mockReturnValue({
    path: kubeConfigPath,
  } as Uri);
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  const kubeconfigFileContent = `{
    clusters: [
      {
        name: 'cluster1',
        cluster: {
          server: 'https://cluster1.example.com',
        },
      },
      {
        name: 'cluster2',
        cluster: {
          server: 'https://cluster2.example.com',
        },
      },
    ],
    users: [
      {
        name: 'user1',
      },
    ],
    contexts: [
      {
        name: 'context1',
        context: {
          cluster: 'cluster1',
          user: 'user1',
          namespace: 'namespace1'
        }
      }
    ],
    "current-context": "context1"
  }`;
  kubeConfig.loadFromString(kubeconfigFileContent);
  await contextsManager.update(kubeConfig);

  expect(contextsManager.getKubeConfig().getContexts()).toHaveLength(1);
  const contexts = contextsManager.getKubeConfig().getContexts();
  expect(contexts[0].cluster).toBe('cluster1');

  await contextsManager.editContext(kubeConfig.contexts[0].name, {
    name: kubeConfig.contexts[0].name,
    namespace: 'namespace1',
    cluster: 'cluster2',
    user: 'user1',
  });
  const contexts2 = contextsManager.getKubeConfig().getContexts();
  expect(contexts2[0].cluster).toBe('cluster2');
  expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('editContext');
});

test('should update the user updating context from config', async () => {
  const kubeConfigPath = '/path/to/kube/config';
  vol.fromJSON({
    [kubeConfigPath]: '{}',
  });
  vi.mocked(kubernetes.getKubeconfig).mockReturnValue({
    path: kubeConfigPath,
  } as Uri);
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  const kubeconfigFileContent = `{
    clusters: [
      {
        name: 'cluster1',
        cluster: {
          server: 'https://cluster1.example.com',
        },
      },
    ],
    users: [
      {
        name: 'user1',
      },
      {
        name: 'user2',
      },
    ],
    contexts: [
      {
        name: 'context1',
        context: {
          cluster: 'cluster1',
          user: 'user1',
          namespace: 'namespace1'
        }
      }
    ],
    "current-context": "context1"
  }`;
  kubeConfig.loadFromString(kubeconfigFileContent);
  await contextsManager.update(kubeConfig);

  expect(contextsManager.getKubeConfig().getContexts()).toHaveLength(1);
  const contexts = contextsManager.getKubeConfig().getContexts();
  expect(contexts[0].user).toBe('user1');

  await contextsManager.editContext(kubeConfig.contexts[0].name, {
    name: kubeConfig.contexts[0].name,
    namespace: 'namespace1',
    cluster: 'cluster1',
    user: 'user2',
  });
  const contexts2 = contextsManager.getKubeConfig().getContexts();
  expect(contexts2[0].user).toBe('user2');
  expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('editContext');
});

describe('getImportContexts', () => {
  test('should return contexts with server info and no conflicts', async () => {
    const kubeConfigPath = '/path/to/kubeconfig.yaml';
    vol.fromJSON({ [kubeConfigPath]: '' });

    const loadFromFileSpy = vi.spyOn(KubeConfig.prototype, 'loadFromFile');
    loadFromFileSpy.mockImplementation(function (this: KubeConfig, filePath: unknown) {
      if (filePath === kubeConfigPath) {
        this.loadFromString(`
          clusters:
            - name: test-cluster
              cluster:
                server: https://test-server:6443
          users:
            - name: test-user
          contexts:
            - name: test-context
              context:
                cluster: test-cluster
                user: test-user
                namespace: default
          current-context: test-context
        `);
      }
    });

    const contextsManager = container.get(ContextsManager);
    const result = await contextsManager.getImportContexts(kubeConfigPath);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('test-context');
    expect(result[0].cluster).toBe('test-cluster');
    expect(result[0].user).toBe('test-user');
    expect(result[0].namespace).toBe('default');
    expect(result[0].server).toBe('https://test-server:6443');
    expect(result[0].hasConflict).toBe(false);
  });

  test('should return empty array if file does not exist', async () => {
    const contextsManager = container.get(ContextsManager);

    const result = await contextsManager.getImportContexts('/nonexistent/file');
    expect(result).toEqual([]);
    expect(window.showNotification).toHaveBeenCalledWith({
      title: 'Error getting import contexts',
      body: 'Kubeconfig file /nonexistent/file does not exist',
      type: 'error',
      highlight: true,
    });
  });

  test('should return empty array if kubeconfig parsing fails', async () => {
    const kubeConfigPath = '/path/to/invalid.yaml';
    vol.fromJSON({ [kubeConfigPath]: '' });

    const loadFromFileSpy = vi.spyOn(KubeConfig.prototype, 'loadFromFile');
    loadFromFileSpy.mockImplementation(() => {
      throw new Error('Invalid YAML');
    });

    const contextsManager = container.get(ContextsManager);

    const result = await contextsManager.getImportContexts(kubeConfigPath);
    expect(result).toEqual([]);
    expect(window.showNotification).toHaveBeenCalledWith({
      title: 'Error getting import contexts',
      body: 'Failed to parse kubeconfig file /path/to/invalid.yaml: Error: Invalid YAML',
      type: 'error',
      highlight: true,
    });
  });

  test('should return multiple contexts', async () => {
    const kubeConfigPath = '/path/to/kubeconfig.yaml';
    vol.fromJSON({ [kubeConfigPath]: '' });

    const loadFromFileSpy = vi.spyOn(KubeConfig.prototype, 'loadFromFile');
    loadFromFileSpy.mockImplementation(function (this: KubeConfig, filePath: unknown) {
      if (filePath === kubeConfigPath) {
        this.loadFromString(`
          clusters:
            - name: cluster1
              cluster:
                server: https://cluster1:6443
            - name: cluster2
              cluster:
                server: https://cluster2:6443
          users:
            - name: user1
            - name: user2
          contexts:
            - name: context1
              context:
                cluster: cluster1
                user: user1
            - name: context2
              context:
                cluster: cluster2
                user: user2
          current-context: context1
        `);
      }
    });

    const contextsManager = container.get(ContextsManager);
    const result = await contextsManager.getImportContexts(kubeConfigPath);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('context1');
    expect(result[0].server).toBe('https://cluster1:6443');
    expect(result[1].name).toBe('context2');
    expect(result[1].server).toBe('https://cluster2:6443');
  });

  test('should detect conflicts with existing contexts', async () => {
    const kubeConfigPath = '/path/to/kubeconfig.yaml';
    vol.fromJSON({ [kubeConfigPath]: '' });

    // First set up the current config with an existing context
    const contextsManager = container.get(ContextsManager);
    const currentConfig = new KubeConfig();
    currentConfig.loadFromString(`
      clusters:
        - name: existing-cluster
          cluster:
            server: https://existing:6443
      users:
        - name: existing-user
      contexts:
        - name: existing-context
          context:
            cluster: existing-cluster
            user: existing-user
      current-context: existing-context
    `);
    await contextsManager.update(currentConfig);

    // Now mock the import file with a conflicting context name
    const loadFromFileSpy = vi.spyOn(KubeConfig.prototype, 'loadFromFile');
    loadFromFileSpy.mockImplementation(function (this: KubeConfig, filePath: unknown) {
      if (filePath === kubeConfigPath) {
        this.loadFromString(`
          clusters:
            - name: new-cluster
              cluster:
                server: https://new:6443
          users:
            - name: new-user
          contexts:
            - name: existing-context
              context:
                cluster: new-cluster
                user: new-user
            - name: new-context
              context:
                cluster: new-cluster
                user: new-user
          current-context: existing-context
        `);
      }
    });

    const result = await contextsManager.getImportContexts(kubeConfigPath);

    expect(result).toHaveLength(2);
    // existing-context should have conflict
    expect(result[0].name).toBe('existing-context');
    expect(result[0].hasConflict).toBe(true);
    // new-context should not have conflict
    expect(result[1].name).toBe('new-context');
    expect(result[1].hasConflict).toBe(false);
  });
});

describe('importContextsFromFile', () => {
  const kubeConfigPath = '/path/to/kube/config';
  const importFilePath = '/path/to/import.yaml';

  beforeEach(() => {
    vol.fromJSON({
      [kubeConfigPath]: '',
    });
    vi.mocked(kubernetes.getKubeconfig).mockReturnValue({
      path: kubeConfigPath,
    } as Uri);
  });

  test('should import new context without conflict', async () => {
    const loadFromFileSpy = vi.spyOn(KubeConfig.prototype, 'loadFromFile');
    loadFromFileSpy.mockImplementation(function (this: KubeConfig) {
      this.loadFromString(`
          clusters:
            - name: new-cluster
              cluster:
                server: https://new:6443
          users:
            - name: new-user
          contexts:
            - name: new-context
              context:
                cluster: new-cluster
                user: new-user
          current-context: new-context
        `);
    });

    const contextsManager = container.get(ContextsManager);
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromString(`
      clusters:
        - name: existing-cluster
          cluster:
            server: https://existing:6443
      users:
        - name: existing-user
      contexts:
        - name: existing-context
          context:
            cluster: existing-cluster
            user: existing-user
      current-context: existing-context
    `);
    await contextsManager.update(kubeConfig);

    expect(contextsManager.getKubeConfig().contexts).toHaveLength(1);

    await contextsManager.importContextsFromFile(importFilePath, ['new-context'], {});

    expect(contextsManager.getKubeConfig().contexts).toHaveLength(2);
    expect(contextsManager.getKubeConfig().contexts.find(c => c.name === 'new-context')).toBeDefined();
    expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('importContexts');
  });

  test('should replace existing context with replace resolution', async () => {
    const loadFromFileSpy = vi.spyOn(KubeConfig.prototype, 'loadFromFile');
    loadFromFileSpy.mockImplementation(function (this: KubeConfig) {
      this.loadFromString(`
          clusters:
            - name: new-cluster
              cluster:
                server: https://new:6443
          users:
            - name: new-user
          contexts:
            - name: test-context
              context:
                cluster: new-cluster
                user: new-user
          current-context: test-context
        `);
    });

    const contextsManager = container.get(ContextsManager);
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromString(`
      clusters:
        - name: old-cluster
          cluster:
            server: https://old:6443
      users:
        - name: old-user
      contexts:
        - name: test-context
          context:
            cluster: old-cluster
            user: old-user
      current-context: test-context
    `);
    await contextsManager.update(kubeConfig);

    await contextsManager.importContextsFromFile(importFilePath, ['test-context'], {
      'test-context': 'replace',
    });

    const contexts = contextsManager.getKubeConfig().contexts;
    expect(contexts).toHaveLength(1);
    expect(contexts[0].name).toBe('test-context');
    expect(contexts[0].cluster).toBe('new-cluster');
    expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('importContexts');
  });

  test('should keep both contexts with keep-both resolution', async () => {
    const loadFromFileSpy = vi.spyOn(KubeConfig.prototype, 'loadFromFile');
    loadFromFileSpy.mockImplementation(function (this: KubeConfig) {
      this.loadFromString(`
          clusters:
            - name: new-cluster
              cluster:
                server: https://new:6443
          users:
            - name: new-user
          contexts:
            - name: test-context
              context:
                cluster: new-cluster
                user: new-user
          current-context: test-context
        `);
    });

    const contextsManager = container.get(ContextsManager);
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromString(`
      clusters:
        - name: old-cluster
          cluster:
            server: https://old:6443
      users:
        - name: old-user
      contexts:
        - name: test-context
          context:
            cluster: old-cluster
            user: old-user
      current-context: test-context
    `);
    await contextsManager.update(kubeConfig);

    await contextsManager.importContextsFromFile(importFilePath, ['test-context'], {
      'test-context': 'keep-both',
    });

    const contexts = contextsManager.getKubeConfig().contexts;
    expect(contexts).toHaveLength(2);
    expect(contexts.find(c => c.name === 'test-context')).toBeDefined();
    expect(contexts.find(c => c.name === 'test-context-1')).toBeDefined();
    expect(telemetryLoggerMock.logUsage).toHaveBeenCalledWith('importContexts');
  });
});

describe('findNewContextName', () => {
  test('should generate unique context name', () => {
    const contextsManager = container.get(ContextsManager);
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromOptions({
      clusters: [],
      users: [],
      contexts: [
        { name: 'existing-1', cluster: 'c1', user: 'u1' },
        { name: 'existing-2', cluster: 'c2', user: 'u2' },
      ],
      currentContext: 'existing-1',
    });

    // existing-1 and existing-2 exist, so next is existing-3
    const newName = contextsManager.findNewContextName(kubeConfig, 'existing');
    expect(newName).toBe('existing-3');
  });

  test('should increment counter if name already exists', () => {
    const contextsManager = container.get(ContextsManager);
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromOptions({
      clusters: [],
      users: [],
      contexts: [
        { name: 'existing-1', cluster: 'c1', user: 'u1' },
        { name: 'existing-2', cluster: 'c2', user: 'u2' },
      ],
      currentContext: 'existing-1',
    });

    const newName = contextsManager.findNewContextName(kubeConfig, 'existing-1');
    expect(newName).toBe('existing-1-1');
  });

  test('should handle empty contexts array', () => {
    const contextsManager = container.get(ContextsManager);
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromOptions({
      clusters: [],
      users: [],
      contexts: [],
      currentContext: '',
    });

    const newName = contextsManager.findNewContextName(kubeConfig, 'test');
    expect(newName).toBe('test-1');
  });
});

test('connectToContext sends notification if dashboard api is not accessible', async () => {
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  kubeConfig.loadFromString(`
    clusters:
      - name: cluster1
        cluster:
          server: https://cluster1.example.com
  `);
  vi.mocked(dashboardApiManagerMock.getApi).mockReturnValue(undefined);
  await contextsManager.connectToContext('context1');
  expect(window.showNotification).toHaveBeenCalledWith({
    title: 'Error connecting to context',
    body: 'You need to install the Kubernetes Dashboard extension',
    type: 'error',
    highlight: true,
  });
});

test('connectToContext calls api.contexts.connect if dashboard api is accessible', async () => {
  const contextsManager = container.get(ContextsManager);
  const kubeConfig = new KubeConfig();
  kubeConfig.loadFromString(`
    clusters:
      - name: cluster1
        cluster:
          server: https://cluster1.example.com
  `);
  const apiMock = {
    contexts: {
      connect: vi.fn(),
    },
  } as unknown as KubernetesDashboardExtensionApi;
  vi.mocked(dashboardApiManagerMock.getApi).mockReturnValue(apiMock);
  await contextsManager.connectToContext('context1', { resources: ['seals', 'dolphins'] });
  expect(apiMock.contexts.connect).toHaveBeenCalledWith('context1', { resources: ['seals', 'dolphins'] });
});
