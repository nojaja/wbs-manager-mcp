import { ArtifactTreeProvider} from '../views/explorer/artifactTree';
import { CommandHandler } from './CommandHandler';

/**
 * CreateArtifactHandler
 * ArtifactTree から新しい成果物を作成するコマンドのハンドラです。
 */
export class CreateArtifactHandler extends CommandHandler {

  /**
   * Handle command to create an artifact
   * @returns 新規作成されたアーティファクトまたは undefined
   */
  async handle() {
    const artifactProvider = ArtifactTreeProvider.getInstance();
    return artifactProvider.createArtifact();
  }
}
