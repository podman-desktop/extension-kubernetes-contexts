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

import { ContainerModule } from 'inversify';

import { ContextsManager } from './contexts-manager';
import { ChannelSubscriber } from '/@/manager/channel-subscriber';
import { Dispatcher } from '/@/manager/dispatcher';
import { DashboardStatesManager } from './dashboard-states-manager';
import { OpenDialogApiImpl } from '/@/manager/open-dialog-api';
import { DashboardApiManager } from '/@/manager/dashboard-api-manager';

const managersModule = new ContainerModule(options => {
  options.bind<ContextsManager>(ContextsManager).toSelf().inSingletonScope();
  options.bind<ChannelSubscriber>(ChannelSubscriber).toSelf().inSingletonScope();
  options.bind<Dispatcher>(Dispatcher).toSelf().inSingletonScope();
  options.bind<DashboardStatesManager>(DashboardStatesManager).toSelf().inSingletonScope();
  options.bind<OpenDialogApiImpl>(OpenDialogApiImpl).toSelf().inSingletonScope();
  options.bind<DashboardApiManager>(DashboardApiManager).toSelf().inSingletonScope();

  // Bind IDisposable to services which need to clear data/stop connection/etc when the panel is left
  // (the onDestroy are not called from components when the panel is left, which may introduce memory leaks if not disposed here)
});

export { managersModule };
