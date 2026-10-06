import { Component, ElementRef, EventEmitter, Input, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rich-text-editor.component.html'
})
export class RichTextEditorComponent {
  @Input() set value(v: string) {
    // Only push external updates into the DOM when they actually differ (avoids cursor jumps while typing)
    if (this.editor && v !== this.editor.nativeElement.innerHTML) {
      this.editor.nativeElement.innerHTML = v || '';
    }
    this._pendingInitial = v || '';
  }
  @Input() readOnly = false;
  @Output() valueChange = new EventEmitter<string>();

  @ViewChild('editor') editor!: ElementRef<HTMLDivElement>;

  private _pendingInitial = '';

  ngAfterViewInit() {
    this.editor.nativeElement.innerHTML = this._pendingInitial;
  }

  exec(command: string, value?: string) {
    document.execCommand(command, false, value);
    this.editor.nativeElement.focus();
    this.onInput();
  }

  onInput() {
    this.valueChange.emit(this.editor.nativeElement.innerHTML);
  }
}
