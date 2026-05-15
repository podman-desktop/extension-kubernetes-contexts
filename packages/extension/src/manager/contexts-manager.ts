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

import { ConnectOptions, ContextsApi, ImportContextInfo } from '@kubernetes-contexts/channels';
import { inject, injectable } from 'inversify';
import { Emitter, Event } from '/@/types/emitter';
import { Cluster, Context, KubeConfig, User } from '@kubernetes/client-node';
import { kubernetes, TelemetryLogger, window } from '@podman-desktop/api';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as jsYaml from 'js-yaml';
import { DashboardApiManager } from '/@/manager/dashboard-api-manager';
import { TelemetryLoggerSymbol } from '/@/inject/symbol';

@injectable()
export class ContextsManager implements ContextsApi {
  #onContextsChange = new Emitter<void>();
  onContextsChange: Event<void> = this.#onContextsChange.event;

  #currentKubeConfig: KubeConfig;

  @inject(DashboardApiManager)
  protected dashboardApiManager: DashboardApiManager;

  @inject(TelemetryLoggerSymbol)
  protected telemetryLogger: TelemetryLogger;

  constructor() {
    // start with an empty kubeconfig
    this.#currentKubeConfig = new KubeConfig();
  }

  async update(kubeConfig: KubeConfig): Promise<void> {
    this.#currentKubeConfig = kubeConfig;
    this.#onContextsChange.fire();
  }

  getKubeConfig(): KubeConfig {
    return this.#currentKubeConfig;
  }

  async setCurrentContext(contextName: string): Promise<void> {
    try {
      this.#currentKubeConfig.setCurrentContext(contextName);
      await this.saveKubeConfig();
      this.#onContextsChange.fire();
    } catch (error: unknown) {
      window.showNotification({
        title: 'Error setting current context',
        body: `Setting current context to "${contextName}" failed: ${String(error)}`,
        type: 'error',
        highlight: true,
      });
    } finally {
      this.telemetryLogger.logUsage('setCurrentContext');
    }
  }

  async deleteContext(contextName: string): Promise<void> {
    const isCurrentContext = contextName === this.#currentKubeConfig.getCurrentContext();
    const message = isCurrentContext
      ? `Are you sure you want to delete context "${contextName}"? This is the current context, you will need to switch to another context.`
      : `Are you sure you want to delete context "${contextName}"?`;
    const result = await window.showInformationMessage(message, 'Yes', 'Cancel');
    if (result !== 'Yes') {
      return;
    }
    await this.deleteContextInternal(contextName);
  }

  findNewContextName(kubeConfig: KubeConfig, contextName: string): string {
    let counter = 1;
    let newName = `${contextName}-${counter}`;
    // Keep creating new name by adding 1 to name until not existing name is found
    while (kubeConfig.contexts.find(context => context.name === newName)) {
      counter += 1;
      newName = `${contextName}-${counter}`;
    }
    return newName;
  }

  async duplicateContext(contextName: string): Promise<void> {
    try {
      const newConfig = new KubeConfig();
      const kubeConfig = this.getKubeConfig();
      const newName = this.findNewContextName(kubeConfig, contextName);
      const originalContext = kubeConfig.contexts.find(context => context.name === contextName);
      if (!originalContext) return;

      newConfig.loadFromOptions({
        clusters: kubeConfig.clusters,
        users: kubeConfig.users,
        currentContext: kubeConfig.currentContext,
        contexts: [
          ...kubeConfig.contexts,
          {
            ...originalContext,
            name: newName,
          },
        ],
      });

      await this.update(newConfig);
      await this.saveKubeConfig();
    } catch (error: unknown) {
      window.showNotification({
        title: 'Error duplicating context',
        body: `Duplicating context "${contextName}" failed: ${String(error)}`,
        type: 'error',
        highlight: true,
      });
    } finally {
      this.telemetryLogger.logUsage('duplicateContext');
    }
  }

  async deleteContextInternal(contextName: string): Promise<void> {
    try {
      this.#currentKubeConfig = this.removeContext(this.#currentKubeConfig, contextName);
      await this.saveKubeConfig();
      this.#onContextsChange.fire();
    } catch (error: unknown) {
      window.showNotification({
        title: 'Error deleting context',
        body: `Deleting context "${contextName}" failed: ${String(error)}`,
        type: 'error',
        highlight: true,
      });
    }
  }

  async saveKubeConfig(): Promise<void> {
    const jsonString = this.#currentKubeConfig.exportConfig();
    const yamlString = jsYaml.dump(JSON.parse(jsonString));
    const kubeconfigUri = kubernetes.getKubeconfig();
    await writeFile(kubeconfigUri.path, yamlString);
  }

  removeContext(kubeconfig: KubeConfig, contextName: string): KubeConfig {
    this.telemetryLogger.logUsage('deleteContext');
    const previousContexts = kubeconfig.contexts;
    const previousCurrentContextName = kubeconfig.getCurrentContext();
    const newContexts = previousContexts.filter(ctx => ctx.name !== contextName);
    if (newContexts.length === previousContexts.length) {
      return kubeconfig;
    }
    let newCurrentContextName: string | undefined = previousCurrentContextName;
    if (previousCurrentContextName === contextName) {
      newCurrentContextName = undefined;
    }

    const newConfig = new KubeConfig();
    newConfig.loadFromOptions({
      contexts: newContexts,
      clusters: kubeconfig.clusters.filter(cluster => {
        // remove clusters not referenced anymore, except if there were already not referenced before
        return (
          newContexts.some(ctx => ctx.cluster === cluster.name) ||
          !previousContexts.some(ctx => ctx.cluster === cluster.name)
        );
      }),
      users: kubeconfig.users.filter(user => {
        // remove users not referenced anymore, except if there were already not referenced before
        return newContexts.some(ctx => ctx.user === user.name) || !previousContexts.some(ctx => ctx.user === user.name);
      }),
      currentContext: newCurrentContextName ?? '',
    });
    return newConfig;
  }

  async editContext(contextName: string, newContext: Context): Promise<void> {
    try {
      const newConfig = new KubeConfig();
      const kubeConfig = this.getKubeConfig();

      const originalContext = kubeConfig.contexts.find(context => context.name === contextName);
      const newContexts = kubeConfig.contexts.filter(ctx => ctx.name !== contextName);
      if (!originalContext) throw new Error('Context name was not found in kube config');

      const namespaceField = newContext.namespace !== '' ? { namespace: newContext.namespace } : {};

      const editedContext = {
        ...originalContext,
        name: newContext.name,
        cluster: newContext.cluster,
        user: newContext.user,
        ...namespaceField,
      };

      if (newContext.namespace === '') {
        delete editedContext.namespace;
      }

      newConfig.loadFromOptions({
        clusters: kubeConfig.clusters,
        users: kubeConfig.users,
        currentContext: kubeConfig.getCurrentContext() === contextName ? newContext.name : kubeConfig.currentContext,
        contexts: [editedContext, ...newContexts],
      });

      await this.update(newConfig);
      await this.saveKubeConfig();
    } catch (error: unknown) {
      window.showNotification({
        title: 'Error editing context',
        body: `Editing context "${contextName}" failed: ${String(error)}`,
        type: 'error',
        highlight: true,
      });
    } finally {
      this.telemetryLogger.logUsage('editContext');
    }
  }

  /**
   * Parse a kubeconfig file and return contexts with conflict information
   *
   * @param filePath path to the kubeconfig file
   * @returns Array of ImportContextInfo with conflict info
   */
  async getImportContexts(filePath: string): Promise<ImportContextInfo[]> {
    // Check if file exists
    if (!existsSync(filePath)) {
      window.showNotification({
        title: 'Error getting import contexts',
        body: `Kubeconfig file ${filePath} does not exist`,
        type: 'error',
        highlight: true,
      });
      return [];
    }

    try {
      const importConfig = new KubeConfig();
      importConfig.loadFromFile(filePath);

      const results: ImportContextInfo[] = [];

      for (const context of importConfig.contexts) {
        // Check if context already exists in current kubeconfig
        const existingContext = this.getContextFromConfig(this.#currentKubeConfig, context.name);
        const hasConflict = existingContext !== undefined;

        // Get server URL from cluster
        const cluster = importConfig.clusters.find(c => c.name === context.cluster);
        const server = cluster?.server;

        results.push({
          name: context.name,
          cluster: context.cluster,
          user: context.user,
          namespace: context.namespace,
          server,
          hasConflict,
        });
      }

      return results;
    } catch (error: unknown) {
      window.showNotification({
        title: 'Error getting import contexts',
        body: `Failed to parse kubeconfig file ${filePath}: ${String(error)}`,
        type: 'error',
        highlight: true,
      });
      return [];
    }
  }

  /**
   * Import contexts from a kubeconfig file into the current kubeconfig
   *
   * @param filePath path to the kubeconfig file to import from
   * @param selectedContexts array of context names to import
   * @param conflictResolutions map of context names to conflict resolution strategies
   */
  async importContextsFromFile(
    filePath: string,
    selectedContexts: string[],
    conflictResolutions: Record<string, 'keep-both' | 'replace'>,
  ): Promise<void> {
    try {
      // Parse the source kubeconfig file
      const tempConfig = new KubeConfig();
      tempConfig.loadFromFile(filePath);
      const newConfig = new KubeConfig();
      newConfig.loadFromString(this.getKubeConfig().exportConfig());

      // Process each selected context
      for (const contextName of selectedContexts) {
        this.processContextImport(newConfig, tempConfig, contextName, conflictResolutions);
      }

      await this.update(newConfig);
      await this.saveKubeConfig();
    } catch (error: unknown) {
      window.showNotification({
        title: 'Error importing contexts',
        body: `Importing contexts from file ${filePath} failed: ${String(error)}`,
        type: 'error',
        highlight: true,
      });
    } finally {
      this.telemetryLogger.logUsage('importContexts');
    }
  }

  protected resolveNamingConflicts(
    contextName: string,
    sourceContext: Context,
    existingContext: Context | undefined,
    conflictResolution: 'keep-both' | 'replace' | undefined,
  ): { finalContextName: string; finalClusterName: string; finalUserName: string } {
    let finalContextName = contextName;
    let finalClusterName = sourceContext.cluster;
    let finalUserName = sourceContext.user;

    if (existingContext) {
      if (conflictResolution === 'replace') {
        // Names will be replaced, so keep original names
        finalContextName = contextName;
        finalClusterName = sourceContext.cluster;
        finalUserName = sourceContext.user;
      } else if (conflictResolution === 'keep-both') {
        // Generate unique context name only, keep original cluster and user names
        finalContextName = this.findNewContextName(this.getKubeConfig(), contextName);
        finalClusterName = sourceContext.cluster;
        finalUserName = sourceContext.user;
      }
    }

    return { finalContextName, finalClusterName, finalUserName };
  }

  protected addContextToKubeconfig(
    newConfig: KubeConfig,
    finalContextName: string,
    finalClusterName: string,
    finalUserName: string,
    sourceContext: Context,
  ): void {
    newConfig.contexts.push({
      name: finalContextName,
      cluster: finalClusterName,
      user: finalUserName,
      namespace: sourceContext.namespace,
    });
  }

  protected processContextImport(
    newConfig: KubeConfig,
    tempConfig: KubeConfig,
    contextName: string,
    conflictResolutions: Record<string, 'keep-both' | 'replace'>,
  ): void {
    const sourceContext = this.getContextFromConfig(tempConfig, contextName);
    if (!sourceContext) {
      return;
    }

    const sourceCluster = this.getClusterFromConfig(tempConfig, contextName);
    const sourceUser = this.getUserFromConfig(tempConfig, contextName);

    if (!sourceCluster || !sourceUser) {
      window.showNotification({
        title: 'Error importing contexts',
        body: `Missing cluster or user information for context ${contextName}`,
        type: 'error',
        highlight: true,
      });
      return;
    }

    const conflictResolution = conflictResolutions[contextName];
    const existingContext = newConfig.contexts.find(ctx => ctx.name === contextName);

    const { finalContextName, finalClusterName, finalUserName } = this.resolveNamingConflicts(
      contextName,
      sourceContext,
      existingContext,
      conflictResolution,
    );

    if (conflictResolution === 'replace' && existingContext) {
      newConfig.contexts = newConfig.contexts.filter(ctx => ctx.name !== contextName);
      newConfig.clusters = newConfig.clusters.filter(c => c.name !== existingContext.cluster);
      newConfig.users = newConfig.users.filter(u => u.name !== existingContext.user);
    }

    this.addContextToKubeconfig(newConfig, finalContextName, finalClusterName, finalUserName, sourceContext);

    const existingCluster = newConfig.clusters.find(c => c.name === finalClusterName);
    if (!existingCluster) {
      newConfig.clusters.push({
        ...sourceCluster,
        name: finalClusterName,
      });
    }

    const existingUser = newConfig.users.find(u => u.name === finalUserName);
    if (!existingUser) {
      newConfig.users.push({
        ...sourceUser,
        name: finalUserName,
      });
    }
  }

  protected loadImportingKubeconfig(filePath: string): KubeConfig {
    const importingConfig = new KubeConfig();
    importingConfig.loadFromFile(filePath);
    return importingConfig;
  }

  protected getContextFromConfig(config: KubeConfig, contextName: string): Context | undefined {
    return config.contexts.find(ctx => ctx.name === contextName);
  }

  protected getClusterFromConfig(config: KubeConfig, contextName: string): Cluster | undefined {
    const context = this.getContextFromConfig(config, contextName);
    if (!context) {
      return undefined;
    }
    return config.clusters.find(c => c.name === context.cluster);
  }

  protected getUserFromConfig(config: KubeConfig, contextName: string): User | undefined {
    const context = this.getContextFromConfig(config, contextName);
    if (!context) {
      return undefined;
    }
    return config.users.find(u => u.name === context.user);
  }

  async connectToContext(contextName: string, options?: ConnectOptions): Promise<void> {
    const api = this.dashboardApiManager.getApi();
    if (!api) {
      window.showNotification({
        title: 'Error connecting to context',
        body: `You need to install the Kubernetes Dashboard extension`,
        type: 'error',
        highlight: true,
      });
      return;
    }
    await api.contexts.connect(contextName, options);
  }
}
