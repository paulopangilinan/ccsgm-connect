import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-toggle-switch',
  imports: [],
  templateUrl: './toggle-switch.html',
  styleUrl: './toggle-switch.css',
})
export class ToggleSwitch {
  readonly checked = input<boolean>(false);
  readonly checkedChange = output<boolean>();
  readonly label = input('');
  readonly ariaLabel = input('');
  readonly disabled = input(false);

  protected toggle(): void {
    if (!this.disabled()) {
      this.checkedChange.emit(!this.checked());
    }
  }
}
